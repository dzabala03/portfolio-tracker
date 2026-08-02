"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { X, Loader2, ExternalLink, AlertCircle, Star } from "lucide-react";
import { clsx } from "clsx";
import { PriceAlertsPanel } from "@/components/modules/PriceAlertsPanel";

interface Quote {
  currentPrice: number;
  change: number;
  changePct: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
}
interface Profile {
  name: string;
  country: string;
  currency: string;
  exchange: string;
  ipo: string;
  marketCapitalization: number;
  logo: string;
  shareOutstanding: number;
  industry: string;
  weburl: string;
}
interface FinancialLineItem { concept: string; unit: string; label: string; value: number }
interface FinancialReport {
  year: number;
  quarter: number;
  form: string;
  startDate: string;
  endDate: string;
  filedDate: string;
  report: { bs: FinancialLineItem[]; ic: FinancialLineItem[]; cf: FinancialLineItem[] };
}
interface NewsItem { datetime: number; headline: string; summary: string; source: string; url: string; image: string }
interface RecommendationTrend { period: string; strongBuy: number; buy: number; hold: number; sell: number; strongSell: number }
interface DailyClose { date: string; close: number }

interface StockDetailData {
  ticker: string;
  quote: Quote | null;
  profile: Profile | null;
  financials: Record<string, number>;
  statements: FinancialReport[];
  news: NewsItem[];
  recommendations: RecommendationTrend[];
  peers: string[];
}

interface Props {
  ticker: string;
  onClose: () => void;
  onSelectTicker: (ticker: string) => void;
}

type Tab = "resumen" | "financials" | "news" | "analysts";
type StatementKey = "ic" | "bs" | "cf";
type Range = "MTD" | "1M" | "3M" | "6M" | "1Y" | "YTD" | "ALL";
const RANGES: Range[] = ["MTD", "1M", "3M", "6M", "1Y", "YTD", "ALL"];

const STATEMENT_LABELS: Record<StatementKey, string> = {
  ic: "Estado de resultados",
  bs: "Balance general",
  cf: "Flujo de caja",
};

const COLOR_ACCENT = "#0088b0";
const COLOR_DIVIDER = "#e3e1e0";

function formatCompactUSD(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2,
  }).format(value);
}
function formatUSD(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}
function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }).replace(".", "");
}

interface MetricDef { key: string; label: string; format: "usd" | "ratio" | "percent" }
const KEY_METRICS: MetricDef[] = [
  { key: "52WeekHigh", label: "Máximo 52 sem.", format: "usd" },
  { key: "52WeekLow", label: "Mínimo 52 sem.", format: "usd" },
  { key: "peTTM", label: "P/E (TTM)", format: "ratio" },
  { key: "epsTTM", label: "EPS (TTM)", format: "usd" },
  { key: "dividendYieldIndicatedAnnual", label: "Dividend yield", format: "percent" },
  { key: "beta", label: "Beta", format: "ratio" },
  { key: "grossMarginTTM", label: "Margen bruto", format: "percent" },
  { key: "operatingMarginTTM", label: "Margen operativo", format: "percent" },
  { key: "netProfitMarginTTM", label: "Margen neto", format: "percent" },
  { key: "roeTTM", label: "ROE", format: "percent" },
  { key: "roaTTM", label: "ROA", format: "percent" },
  { key: "revenueGrowthTTMYoy", label: "Crecimiento ingresos (YoY)", format: "percent" },
  { key: "currentRatioAnnual", label: "Razón corriente", format: "ratio" },
  { key: "totalDebt/totalEquityAnnual", label: "Deuda / Patrimonio", format: "ratio" },
];

function formatMetricValue(value: number | undefined, format: MetricDef["format"]): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  if (format === "usd") return formatUSD(value);
  if (format === "percent") return `${value.toFixed(2)}%`;
  return value.toFixed(2);
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="perf-tooltip">
      <div>{formatDate(label)}</div>
      <div style={{ fontWeight: 600 }}>{formatUSD(payload[0].value)}</div>
    </div>
  );
}

export function StockDetailModal({ ticker, onClose, onSelectTicker }: Props) {
  const [tab, setTab] = useState<Tab>("resumen");
  const [data, setData] = useState<StockDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statementKey, setStatementKey] = useState<StatementKey>("ic");
  const [reportIndex, setReportIndex] = useState(0);
  const [range, setRange] = useState<Range>("1Y");
  const [chartData, setChartData] = useState<DailyClose[]>([]);
  const [isChartLoading, setIsChartLoading] = useState(true);
  const [watchlistId, setWatchlistId] = useState<string | null>(null);
  const [isTogglingWatchlist, setIsTogglingWatchlist] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    setTab("resumen");
    setReportIndex(0);
    setRange("1Y");
    setWatchlistId(null);

    fetch("/api/watchlist")
      .then((res) => (res.ok ? res.json() : []))
      .then((list: { id: string; ticker: string }[]) => {
        setWatchlistId(list.find((i) => i.ticker === ticker)?.id ?? null);
      })
      .catch(() => {});

    fetch(`/api/stock-detail?ticker=${encodeURIComponent(ticker)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        return json;
      })
      .then((json) => setData(json))
      .catch((err) => {
        console.error("[StockDetailModal]", err);
        setError(err instanceof Error ? err.message : "No se pudo cargar la información.");
      })
      .finally(() => setIsLoading(false));
  }, [ticker]);

  // Fetch separado del histórico de precios — así cambiar el rango del
  // mini-gráfico no vuelve a pedir perfil/financieros/noticias. Guarda
  // qué (ticker, rango) fue el último pedido para descartar respuestas
  // que lleguen tarde y ya no correspondan a la selección actual.
  const latestChartRequestRef = useRef<string>("");
  useEffect(() => {
    const requestKey = `${ticker}:${range}`;
    latestChartRequestRef.current = requestKey;
    setIsChartLoading(true);

    fetch(`/api/stock-history?ticker=${encodeURIComponent(ticker)}&range=${range}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        return json;
      })
      .then((json) => {
        if (latestChartRequestRef.current !== requestKey) return;
        setChartData(json.priceHistory ?? []);
      })
      .catch((err) => {
        if (latestChartRequestRef.current !== requestKey) return;
        console.error("[StockDetailModal] history", err);
        setChartData([]);
      })
      .finally(() => {
        if (latestChartRequestRef.current === requestKey) setIsChartLoading(false);
      });
  }, [ticker, range]);

  async function handleToggleWatchlist() {
    setIsTogglingWatchlist(true);
    try {
      if (watchlistId) {
        const res = await fetch(`/api/watchlist/${watchlistId}`, { method: "DELETE" });
        if (res.ok) setWatchlistId(null);
      } else {
        const res = await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker }),
        });
        if (res.ok) {
          const item = await res.json();
          setWatchlistId(item.id);
        }
      }
    } catch (err) {
      console.error("[StockDetailModal] watchlist", err);
    } finally {
      setIsTogglingWatchlist(false);
    }
  }

  const changeUp = (data?.quote?.change ?? 0) >= 0;
  const rangeChangePct = useMemo(() => {
    if (chartData.length < 2) return null;
    const first = chartData[0].close;
    const last = chartData[chartData.length - 1].close;
    if (!first) return null;
    return ((last - first) / first) * 100;
  }, [chartData]);
  const currentReport = data?.statements[reportIndex];
  const lineItems = currentReport?.report[statementKey] ?? [];

  return (
    <div role="dialog" aria-modal="true" aria-label={`Detalle de ${ticker}`} className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" style={{ width: 720, maxWidth: "92vw", maxHeight: "88vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {data?.profile?.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.profile.logo} alt="" width={28} height={28} style={{ borderRadius: 6 }} />
            )}
            <div>
              <h3 className="dialog-title" style={{ margin: 0 }}>{ticker}</h3>
              {data?.profile?.name && <div className="text-muted" style={{ fontSize: 12 }}>{data.profile.name}</div>}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <button
              onClick={handleToggleWatchlist}
              className="btn btn-icon"
              aria-label={watchlistId ? "Quitar de watchlist" : "Agregar a watchlist"}
              title={watchlistId ? "Quitar de watchlist" : "Agregar a watchlist"}
              disabled={isTogglingWatchlist}
            >
              {isTogglingWatchlist
                ? <Loader2 size={18} className="animate-spin" />
                : <Star size={18} color="var(--color-accent)" fill={watchlistId ? "var(--color-accent)" : "none"} />}
            </button>
            <button onClick={onClose} className="btn btn-icon" aria-label="Cerrar">
              <X size={18} />
            </button>
          </div>
        </div>

        {isLoading && (
          <div className="chart-empty" style={{ marginTop: "var(--space-4)" }}>
            <Loader2 size={16} className="animate-spin" style={{ marginRight: 6 }} />
            Cargando información de {ticker}…
          </div>
        )}

        {!isLoading && error && (
          <div className="chart-empty" style={{ marginTop: "var(--space-4)" }}>
            <AlertCircle size={16} style={{ marginRight: 6 }} />
            {error}
          </div>
        )}

        {!isLoading && !error && data && (
          <>
            <div className="seg" role="tablist" style={{ marginTop: "var(--space-4)", marginBottom: "var(--space-4)", flexShrink: 0 }}>
              <label className="seg-opt"><input type="radio" name="stock-tab" checked={tab === "resumen"} onChange={() => setTab("resumen")} /><span>Resumen</span></label>
              <label className="seg-opt"><input type="radio" name="stock-tab" checked={tab === "financials"} onChange={() => setTab("financials")} /><span>Estados financieros</span></label>
              <label className="seg-opt"><input type="radio" name="stock-tab" checked={tab === "news"} onChange={() => setTab("news")} /><span>Noticias</span></label>
              <label className="seg-opt"><input type="radio" name="stock-tab" checked={tab === "analysts"} onChange={() => setTab("analysts")} /><span>Analistas</span></label>
            </div>

            {tab === "resumen" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                {data.quote && (
                  <div>
                    <span className="big-num" style={{ fontSize: 32 }}>{formatUSD(data.quote.currentPrice)}</span>
                    <span className={clsx("delta", changeUp ? "up" : "down")} style={{ marginLeft: 10 }}>
                      {changeUp ? "+" : ""}{formatUSD(data.quote.change)} ({changeUp ? "+" : ""}{data.quote.changePct.toFixed(2)}%)
                    </span>
                    <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                      Apertura {formatUSD(data.quote.open)} · Máx {formatUSD(data.quote.high)} · Mín {formatUSD(data.quote.low)} · Cierre anterior {formatUSD(data.quote.prevClose)}
                    </div>
                  </div>
                )}

                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
                    <div className="seg" role="group" aria-label="Rango de tiempo">
                      {RANGES.map((r) => (
                        <label key={r} className="seg-opt">
                          <input type="radio" name="stock-chart-range" checked={range === r} onChange={() => setRange(r)} />
                          <span>{r}</span>
                        </label>
                      ))}
                    </div>
                    {!isChartLoading && rangeChangePct !== null && (
                      <span className={clsx("delta", rangeChangePct >= 0 ? "up" : "down")} style={{ fontWeight: 600 }}>
                        {rangeChangePct >= 0 ? "+" : ""}{rangeChangePct.toFixed(2)}% en {range}
                      </span>
                    )}
                  </div>

                  {isChartLoading ? (
                    <div className="chart-empty" style={{ height: 160 }}>Cargando…</div>
                  ) : chartData.length > 1 ? (
                    <ResponsiveContainer width="100%" height={160}>
                      <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                        <XAxis dataKey="date" hide />
                        <YAxis hide domain={["auto", "auto"]} />
                        <Tooltip content={<ChartTooltip />} />
                        <Line type="monotone" dataKey="close" stroke={COLOR_ACCENT} strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="chart-empty" style={{ height: 160 }}>Sin historial de precios para este rango.</div>
                  )}
                </div>

                <div className="quick-stats" style={{ marginTop: 0 }}>
                  <div className="qs-row">
                    <span>Capitalización de mercado</span>
                    <span>{data.profile ? formatCompactUSD(data.profile.marketCapitalization * 1_000_000) : "—"}</span>
                  </div>
                  <div className="qs-row">
                    <span>Acciones en circulación</span>
                    <span>{data.profile ? `${(data.profile.shareOutstanding).toLocaleString("en-US", { maximumFractionDigits: 1 })}M` : "—"}</span>
                  </div>
                  <div className="qs-row">
                    <span>Industria</span>
                    <span>{data.profile?.industry || "—"}</span>
                  </div>
                  <div className="qs-row">
                    <span>País / Bolsa</span>
                    <span>{data.profile ? `${data.profile.country} · ${data.profile.exchange}` : "—"}</span>
                  </div>
                  <div className="qs-row">
                    <span>OPI</span>
                    <span>{data.profile?.ipo || "—"}</span>
                  </div>
                  {data.profile?.weburl && (
                    <div className="qs-row">
                      <span>Sitio web</span>
                      <a href={data.profile.weburl} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        Visitar <ExternalLink size={12} />
                      </a>
                    </div>
                  )}
                </div>

                <div>
                  <p className="kicker" style={{ marginBottom: "var(--space-2)" }}>Métricas clave</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--space-3)" }}>
                    {KEY_METRICS.map((m) => (
                      <div key={m.key}>
                        <div className="text-muted" style={{ fontSize: 11 }}>{m.label}</div>
                        <div className="num" style={{ fontSize: 14, fontWeight: 600 }}>
                          {formatMetricValue(data.financials[m.key], m.format)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {data.peers.length > 0 && (
                  <div>
                    <p className="kicker" style={{ marginBottom: "var(--space-2)" }}>Comparables</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {data.peers.map((p) => (
                        <button key={p} type="button" className="tag tag-neutral" style={{ cursor: "pointer", border: "none", font: "inherit" }} onClick={() => onSelectTicker(p)}>
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <PriceAlertsPanel kind="stock" ticker={ticker} />
              </div>
            )}

            {tab === "financials" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                {data.statements.length === 0 ? (
                  <p className="empty-note">No hay estados financieros disponibles para {ticker} (común en tickers extranjeros que no reportan a la SEC).</p>
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-2)" }}>
                      <div className="seg" role="group" aria-label="Tipo de estado financiero">
                        {(["ic", "bs", "cf"] as StatementKey[]).map((k) => (
                          <label key={k} className="seg-opt">
                            <input type="radio" name="statement-key" checked={statementKey === k} onChange={() => setStatementKey(k)} />
                            <span>{STATEMENT_LABELS[k]}</span>
                          </label>
                        ))}
                      </div>
                      <div className="seg" role="group" aria-label="Año del reporte">
                        {data.statements.slice(0, 5).map((r, i) => (
                          <label key={`${r.year}-${r.quarter}`} className="seg-opt">
                            <input type="radio" name="report-index" checked={reportIndex === i} onChange={() => setReportIndex(i)} />
                            <span>{r.year}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {currentReport && (
                      <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
                        {currentReport.form} · período {formatDate(currentReport.startDate.slice(0, 10))} – {formatDate(currentReport.endDate.slice(0, 10))} · presentado {formatDate(currentReport.filedDate.slice(0, 10))}
                      </p>
                    )}

                    <div style={{ maxHeight: 360, overflowY: "auto" }}>
                      <table className="table">
                        <tbody>
                          {lineItems.map((item, i) => (
                            <tr key={`${item.concept}-${i}`}>
                              <td>{item.label}</td>
                              <td className="num">{item.unit === "usd" ? formatCompactUSD(item.value) : item.value.toLocaleString("en-US")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}

            {tab === "news" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                {data.news.length === 0 ? (
                  <p className="empty-note">Sin noticias recientes para {ticker}.</p>
                ) : (
                  data.news.map((n, i) => (
                    <a
                      key={i} href={n.url} target="_blank" rel="noopener noreferrer"
                      className="card"
                      style={{ flexDirection: "row", gap: "var(--space-3)", textDecoration: "none", color: "inherit" }}
                    >
                      {n.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={n.image} alt="" width={72} height={72} style={{ borderRadius: 6, objectFit: "cover", flex: "none" }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{n.headline}</div>
                        <p className="card-body" style={{ fontSize: 12, marginTop: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {n.summary}
                        </p>
                        <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
                          {n.source} · {new Date(n.datetime * 1000).toLocaleDateString("es-CO", { day: "2-digit", month: "short" }).replace(".", "")}
                        </div>
                      </div>
                    </a>
                  ))
                )}
              </div>
            )}

            {tab === "analysts" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                {data.recommendations.length === 0 ? (
                  <p className="empty-note">Sin datos de analistas para {ticker}.</p>
                ) : (
                  data.recommendations.slice(0, 4).map((r) => {
                    const total = r.strongBuy + r.buy + r.hold + r.sell + r.strongSell || 1;
                    const segs: { label: string; value: number; color: string }[] = [
                      { label: "Compra fuerte", value: r.strongBuy, color: "#1a7a3c" },
                      { label: "Compra", value: r.buy, color: "#5fae7c" },
                      { label: "Mantener", value: r.hold, color: "#c9c2bd" },
                      { label: "Venta", value: r.sell, color: "#e08a84" },
                      { label: "Venta fuerte", value: r.strongSell, color: "#b3261e" },
                    ];
                    return (
                      <div key={r.period}>
                        <div className="text-muted" style={{ fontSize: 12, marginBottom: 4 }}>{r.period}</div>
                        <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden" }}>
                          {segs.map((s) => (
                            <span key={s.label} title={`${s.label}: ${s.value}`} style={{ background: s.color, width: `${(s.value / total) * 100}%` }} />
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: 10, marginTop: 4, fontSize: 11, flexWrap: "wrap" }}>
                          {segs.map((s) => (
                            <span key={s.label} className="text-muted">{s.label}: {s.value}</span>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
