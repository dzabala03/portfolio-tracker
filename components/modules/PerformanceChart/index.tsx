"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, ReferenceArea, ReferenceDot, ReferenceLine, CartesianGrid,
} from "recharts";
import { formatCurrency } from "@/lib/finance/calculations";
import { clsx } from "clsx";
import { X } from "lucide-react";

// Deben mantenerse en sync con los tokens de app/globals.css —
// los atributos SVG de recharts no resuelven var(--color-*).
const COLOR_ACCENT = "#0088b0";
const COLOR_ACCENT_100 = "#e9f8ff";
const COLOR_ACCENT_500 = "#38a6cf";
const COLOR_GAIN = "#1a7a3c";
const COLOR_LOSS = "#b3261e";
const COLOR_DIVIDER = "#e3e1e0";

type Range = "MTD" | "1M" | "3M" | "6M" | "1Y" | "YTD" | "ALL";
const RANGES: Range[] = ["MTD", "1M", "3M", "6M", "1Y", "YTD", "ALL"];

type ChartMode = "valor" | "pct";

type BenchmarkKey = "NASDAQ" | "NASDAQ100" | "SP500" | "DOWJONES" | "RUSSELL2000";
const BENCHMARK_LABELS: Record<BenchmarkKey, string> = {
  NASDAQ: "Nasdaq Composite",
  NASDAQ100: "Nasdaq 100",
  SP500: "S&P 500",
  DOWJONES: "Dow Jones",
  RUSSELL2000: "Russell 2000",
};
// Un color + trazo por benchmark, para distinguir hasta 5 líneas a la vez.
// Deliberadamente lejos del rojo/verde del portafolio (COLOR_GAIN/COLOR_LOSS)
// — con magenta/crimson (versión anterior) no se podía distinguir el
// benchmark de un portafolio en negativo.
const BENCHMARK_STYLE: Record<BenchmarkKey, { color: string; dash?: string }> = {
  NASDAQ: { color: "#1d4ed8" },              // azul
  SP500: { color: "#ca8a04" },               // ámbar/dorado
  NASDAQ100: { color: "#7c3aed", dash: "4 3" }, // púrpura
  DOWJONES: { color: "#0f766e", dash: "4 3" },  // verde azulado (teal)
  RUSSELL2000: { color: "#57534e", dash: "2 2" }, // gris cálido
};
const ALL_BENCHMARKS = Object.keys(BENCHMARK_LABELS) as BenchmarkKey[];

interface PercentPoint { date: string; pct: number }
interface PerformanceData {
  range: Range;
  series: { date: string; value: number }[];
  twrCurve: PercentPoint[];
  twr: number;
  mwr: number;
  startValue: number;
  endValue: number;
  benchmarks: BenchmarkKey[];
  benchmarkSeries: Record<BenchmarkKey, PercentPoint[]>;
}

function formatChartDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short" }).replace(".", "");
}

function ValueTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as { date: string; value: number };
  return (
    <div className="perf-tooltip">
      <div className="text-muted" style={{ fontSize: 11 }}>{formatChartDate(point.date)}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: COLOR_ACCENT, flexShrink: 0 }} />
        <span style={{ fontWeight: 700, fontSize: 14 }}>{formatCurrency(point.value)}</span>
      </div>
    </div>
  );
}

function PctTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="perf-tooltip">
      <div className="text-muted" style={{ fontSize: 11, marginBottom: 3 }}>{formatChartDate(label)}</div>
      {payload.map((p: any) => {
        if (p.value === undefined || p.value === null) return null;
        const color = p.dataKey === "portfolio" ? (p.value >= 0 ? COLOR_GAIN : COLOR_LOSS) : p.stroke;
        return (
          <div key={p.dataKey} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
            <span style={{ color, fontWeight: 700, fontSize: p.dataKey === "portfolio" ? 14 : 12 }}>
              {p.name}: {p.value >= 0 ? "+" : ""}{p.value.toFixed(2)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Gradiente SVG para una sola línea que cambia de color exactamente en
// el punto donde cruza 0% — evita tanto la línea plana falsa (bug del
// sentinel en 0) como los huecos visibles (bug de connectNulls=false
// con dos series superpuestas). El eje X de un LineChart de Recharts
// reparte los puntos a distancia IGUAL por índice (no por fecha real),
// así que el offset de cada stop es simplemente index/(n-1).
function buildSignGradientStops(values: number[]): { offset: number; color: string }[] {
  const n = values.length;
  if (n === 0) return [];
  if (n === 1) return [{ offset: 0, color: values[0] >= 0 ? COLOR_GAIN : COLOR_LOSS }];

  const colorFor = (v: number) => (v >= 0 ? COLOR_GAIN : COLOR_LOSS);
  const stops: { offset: number; color: string }[] = [];

  for (let i = 0; i < n; i++) {
    stops.push({ offset: i / (n - 1), color: colorFor(values[i]) });

    if (i < n - 1) {
      const v0 = values[i];
      const v1 = values[i + 1];
      if ((v0 >= 0) !== (v1 >= 0)) {
        // Cruce entre los puntos i e i+1 — interpolar dónde el valor
        // pasa por 0, y poner dos stops pegados ahí (sin degradado)
        // para un corte de color nítido en vez de una mezcla.
        const t = v0 / (v0 - v1);
        const crossOffset = (i + t) / (n - 1);
        stops.push({ offset: crossOffset, color: colorFor(v0) });
        stops.push({ offset: crossOffset, color: colorFor(v1) });
      }
    }
  }
  return stops;
}

export function PerformanceChart() {
  const [range, setRange] = useState<Range>("1M");
  const [mode, setMode] = useState<ChartMode>("valor");
  const [selectedBenchmarks, setSelectedBenchmarks] = useState<Set<BenchmarkKey>>(new Set());
  const [data, setData] = useState<PerformanceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selección de rango por click: primer click marca el inicio, segundo
  // click marca el fin (en cualquier orden) — un tercer click empieza
  // una selección nueva desde cero.
  const [selStart, setSelStart] = useState<string | null>(null);
  const [selEnd, setSelEnd] = useState<string | null>(null);

  function handleChartClick(e: any) {
    const label = e?.activeLabel;
    if (!label) return;
    if (!selStart || selEnd) {
      setSelStart(label);
      setSelEnd(null);
    } else {
      setSelEnd(label);
    }
  }

  function clearSelection() {
    setSelStart(null);
    setSelEnd(null);
  }

  const load = useCallback(async (r: Range, benchmarks: Set<BenchmarkKey>) => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ range: r });
      if (benchmarks.size > 0) qs.set("benchmarks", Array.from(benchmarks).join(","));
      const res = await fetch(`/api/portfolio/performance?${qs.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: PerformanceData = await res.json();
      setData(json);
    } catch (err) {
      setError("No se pudo cargar el rendimiento histórico.");
      console.error("[PerformanceChart]", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load(range, selectedBenchmarks);
  }, [range, selectedBenchmarks, load]);

  useEffect(() => {
    clearSelection();
  }, [range]);

  function toggleBenchmark(key: BenchmarkKey) {
    setSelectedBenchmarks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Comparar contra un índice solo tiene sentido en %: forzamos ese modo
  // mientras haya al menos un benchmark activo.
  const effectiveMode: ChartMode = selectedBenchmarks.size > 0 ? "pct" : mode;
  const hasSeries = (data?.series.length ?? 0) >= 2;

  const mergedPct = useMemo(() => {
    if (!data) return [];
    const byDate = new Map<string, Record<string, string | number | null>>();

    // TWR día a día — NO (valor/valor_inicial − 1): eso contaría cada
    // depósito como si fuera retorno de inversión.
    for (const p of data.twrCurve) {
      byDate.set(p.date, { date: p.date, portfolio: p.pct });
    }
    for (const key of selectedBenchmarks) {
      const series = data.benchmarkSeries[key] ?? [];
      for (const p of series) {
        const row = byDate.get(p.date) ?? { date: p.date };
        row[key] = p.pct;
        byDate.set(p.date, row);
      }
    }
    return Array.from(byDate.values()).sort((a, b) => ((a.date as string) < (b.date as string) ? -1 : 1));
  }, [data, selectedBenchmarks]);

  // Los stops del gradiente se calculan sobre la curva TWR completa
  // (no sobre mergedPct, que puede tener huecos si un benchmark no
  // cotizó algún día) para que el degradado quede continuo y correcto.
  const portfolioGradientStops = useMemo(
    () => buildSignGradientStops((data?.twrCurve ?? []).map((p) => p.pct)),
    [data]
  );

  // En modo "% de rendimiento" el cálculo se hace sobre la curva TWR
  // (encadenada), no sobre el valor en dólares: el valor crudo incluye
  // depósitos/retiros entre las dos fechas, así que restar valores en $
  // ahí daría un % sin sentido (ej. un depósito grande entre las dos
  // fechas infla el cambio aunque el rendimiento real haya sido plano
  // o negativo). En modo "valor" sí tiene sentido el cambio en dólares,
  // porque ahí se está mostrando el valor de la cuenta, no un retorno.
  const selection = useMemo(() => {
    if (!selStart || !selEnd || !data) return null;
    const [d1, d2] = [selStart, selEnd].sort();

    if (effectiveMode === "pct") {
      const p1 = data.twrCurve.find((p) => p.date === d1);
      const p2 = data.twrCurve.find((p) => p.date === d2);
      if (!p1 || !p2) return null;
      const growth1 = 1 + p1.pct / 100;
      const growth2 = 1 + p2.pct / 100;
      if (growth1 === 0) return null;
      const changePct = (growth2 / growth1 - 1) * 100;
      return { start: d1, end: d2, changePct, changeValue: null as number | null };
    }

    const startPoint = data.series.find((p) => p.date === d1);
    const endPoint = data.series.find((p) => p.date === d2);
    if (!startPoint || !endPoint || startPoint.value === 0) return null;
    const changeValue = endPoint.value - startPoint.value;
    const changePct = (changeValue / startPoint.value) * 100;
    return { start: d1, end: d2, changePct, changeValue };
  }, [selStart, selEnd, data, effectiveMode]);

  // Día de mejor y peor desempeño dentro de la curva que se está
  // mostrando ahora mismo — se recalcula solo con el rango/modo activos.
  const bestWorstDay = useMemo(() => {
    if (!data) return null;
    const source = effectiveMode === "valor"
      ? data.series.map((p) => ({ date: p.date, v: p.value }))
      : data.twrCurve.map((p) => ({ date: p.date, v: p.pct }));
    if (source.length === 0) return null;
    let best = source[0];
    let worst = source[0];
    for (const p of source) {
      if (p.v > best.v) best = p;
      if (p.v < worst.v) worst = p;
    }
    if (best.date === worst.date) return null;
    return { best, worst };
  }, [data, effectiveMode]);

  return (
    <div className="chart-wrap">
    <div className="chart-card">
      <div className="chart-head">
        <h3 style={{ margin: 0 }}>{effectiveMode === "valor" ? "Evolución del valor" : "Rendimiento (%)"}</h3>
        <div className="seg" role="group" aria-label="Rango de tiempo">
          {RANGES.map((r) => (
            <label key={r} className="seg-opt">
              <input type="radio" name="range" checked={range === r} onChange={() => setRange(r)} />
              <span>{r}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="chart-controls">
        <div className="seg" role="group" aria-label="Tipo de vista">
          <label className="seg-opt">
            <input
              type="radio" name="mode" checked={effectiveMode === "valor"}
              onChange={() => { setMode("valor"); setSelectedBenchmarks(new Set()); }}
            />
            <span>Evolución del valor</span>
          </label>
          <label className="seg-opt">
            <input type="radio" name="mode" checked={effectiveMode === "pct"} onChange={() => setMode("pct")} />
            <span>% de rendimiento</span>
          </label>
        </div>

        <div className="benchmark-chips" role="group" aria-label="Comparar contra índices">
          {ALL_BENCHMARKS.map((key) => {
            const active = selectedBenchmarks.has(key);
            return (
              <button
                key={key}
                type="button"
                className={clsx("tag", active ? "tag-accent-2" : "tag-neutral")}
                style={active ? { borderColor: BENCHMARK_STYLE[key].color, color: BENCHMARK_STYLE[key].color, background: "transparent", border: "1px solid" } : undefined}
                onClick={() => toggleBenchmark(key)}
                aria-pressed={active}
              >
                {BENCHMARK_LABELS[key]}
              </button>
            );
          })}
        </div>
      </div>

      {isLoading && <div className="chart-empty">Calculando rendimiento histórico…</div>}
      {!isLoading && error && <div className="chart-empty">{error}</div>}
      {!isLoading && !error && !hasSeries && (
        <div className="chart-empty">
          No hay suficiente historial de precios para este rango todavía.
          <br />
          Prueba con un rango más amplio o revisa que tus posiciones tengan transacciones en este período.
        </div>
      )}

      {!isLoading && !error && hasSeries && data && (
        <>
          <div className="chart-selection-note" style={{ fontSize: 12, marginBottom: 6, minHeight: 18, display: "flex", alignItems: "center", gap: 8 }}>
            {selection ? (
              <>
                <span className="text-muted">{formatChartDate(selection.start)} → {formatChartDate(selection.end)}:</span>
                <span style={{ fontWeight: 600, color: selection.changePct >= 0 ? COLOR_GAIN : COLOR_LOSS }}>
                  {selection.changePct >= 0 ? "+" : ""}{selection.changePct.toFixed(2)}%
                  {selection.changeValue !== null && ` (${selection.changeValue >= 0 ? "+" : ""}${formatCurrency(selection.changeValue)})`}
                </span>
                <button type="button" className="btn btn-icon btn-icon-sm" onClick={clearSelection} aria-label="Quitar selección">
                  <X size={12} />
                </button>
              </>
            ) : selStart ? (
              <span className="text-muted">Haz click en otro día del gráfico para ver el rendimiento entre ambas fechas.</span>
            ) : (
              <span className="text-muted">Haz click en dos días del gráfico para ver el rendimiento entre ellos.</span>
            )}
          </div>

          {effectiveMode === "valor" ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data.series} margin={{ top: 24, right: 4, bottom: 16, left: 4 }} onClick={handleChartClick}>
                <defs>
                  <linearGradient id="perfFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLOR_ACCENT_500} stopOpacity={0.45} />
                    <stop offset="55%" stopColor={COLOR_ACCENT_100} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={COLOR_ACCENT_100} stopOpacity={0.02} />
                  </linearGradient>
                  <filter id="perfLineGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="1" stdDeviation="2.5" floodColor={COLOR_ACCENT} floodOpacity="0.35" />
                  </filter>
                </defs>
                <CartesianGrid vertical={false} stroke={COLOR_DIVIDER} strokeDasharray="3 4" opacity={0.6} />
                <XAxis
                  dataKey="date" tickFormatter={formatChartDate}
                  tick={{ fontSize: 11, fill: "#8a8685" }} axisLine={{ stroke: COLOR_DIVIDER }}
                  tickLine={false} minTickGap={40}
                />
                <YAxis hide domain={["auto", "auto"]} />
                <Tooltip content={<ValueTooltip />} cursor={{ stroke: COLOR_ACCENT, strokeWidth: 1, strokeDasharray: "3 3" }} />
                {selection && (
                  <ReferenceArea x1={selection.start} x2={selection.end} fill={COLOR_ACCENT} fillOpacity={0.12} stroke={COLOR_ACCENT} strokeOpacity={0.3} />
                )}
                <Area
                  type="monotone" dataKey="value" stroke={COLOR_ACCENT} strokeWidth={2.5} fill="url(#perfFill)"
                  filter="url(#perfLineGlow)"
                  activeDot={{ r: 5, fill: COLOR_ACCENT, stroke: "#fff", strokeWidth: 2 }}
                  isAnimationActive animationDuration={500}
                />
                {bestWorstDay && (
                  <>
                    <ReferenceDot x={bestWorstDay.best.date} y={bestWorstDay.best.v} r={9} fill={COLOR_GAIN} fillOpacity={0.15} stroke="none" />
                    <ReferenceDot x={bestWorstDay.best.date} y={bestWorstDay.best.v} r={5} fill={COLOR_GAIN} stroke="#fff" strokeWidth={2}
                      label={{ value: "★ Mejor día", position: "top", fill: COLOR_GAIN, fontSize: 11, fontWeight: 600 }} />
                    <ReferenceDot x={bestWorstDay.worst.date} y={bestWorstDay.worst.v} r={9} fill={COLOR_LOSS} fillOpacity={0.15} stroke="none" />
                    <ReferenceDot x={bestWorstDay.worst.date} y={bestWorstDay.worst.v} r={5} fill={COLOR_LOSS} stroke="#fff" strokeWidth={2}
                      label={{ value: "▽ Peor día", position: "bottom", fill: COLOR_LOSS, fontSize: 11, fontWeight: 600 }} />
                  </>
                )}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={mergedPct} margin={{ top: 24, right: 4, bottom: 16, left: 4 }} onClick={handleChartClick}>
                <defs>
                  <linearGradient id="portfolioStroke" x1="0" y1="0" x2="1" y2="0">
                    {portfolioGradientStops.map((s, i) => (
                      <stop key={i} offset={s.offset} stopColor={s.color} />
                    ))}
                  </linearGradient>
                  <filter id="pctLineGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="1" stdDeviation="2.5" floodColor={COLOR_ACCENT} floodOpacity="0.3" />
                  </filter>
                </defs>
                <CartesianGrid vertical={false} stroke={COLOR_DIVIDER} strokeDasharray="3 4" opacity={0.6} />
                <XAxis
                  dataKey="date" tickFormatter={formatChartDate}
                  tick={{ fontSize: 11, fill: "#8a8685" }} axisLine={{ stroke: COLOR_DIVIDER }}
                  tickLine={false} minTickGap={40}
                />
                <YAxis
                  tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                  tick={{ fontSize: 11, fill: "#8a8685" }} axisLine={false} tickLine={false} width={44}
                />
                <Tooltip content={<PctTooltip />} cursor={{ stroke: COLOR_ACCENT, strokeWidth: 1, strokeDasharray: "3 3" }} />
                {selectedBenchmarks.size > 0 && <Legend wrapperStyle={{ fontSize: 12 }} />}
                <ReferenceLine y={0} stroke={COLOR_DIVIDER} strokeWidth={1} />
                {selection && (
                  <ReferenceArea x1={selection.start} x2={selection.end} fill={COLOR_ACCENT} fillOpacity={0.12} stroke={COLOR_ACCENT} strokeOpacity={0.3} />
                )}
                <Line
                  type="monotone" dataKey="portfolio" name="Mi portafolio"
                  stroke="url(#portfolioStroke)" strokeWidth={2.5} dot={false} connectNulls
                  filter="url(#pctLineGlow)"
                  activeDot={{ r: 5, fill: COLOR_ACCENT, stroke: "#fff", strokeWidth: 2 }}
                  legendType={selectedBenchmarks.size > 0 ? "line" : "none"}
                  isAnimationActive animationDuration={500}
                />
                {Array.from(selectedBenchmarks).map((key) => (
                  <Line
                    key={key}
                    type="monotone" dataKey={key} name={BENCHMARK_LABELS[key]}
                    stroke={BENCHMARK_STYLE[key].color} strokeWidth={2}
                    strokeDasharray={BENCHMARK_STYLE[key].dash} dot={false} connectNulls
                  />
                ))}
                {bestWorstDay && (
                  <>
                    <ReferenceDot x={bestWorstDay.best.date} y={bestWorstDay.best.v} r={9} fill={COLOR_GAIN} fillOpacity={0.15} stroke="none" />
                    <ReferenceDot x={bestWorstDay.best.date} y={bestWorstDay.best.v} r={5} fill={COLOR_GAIN} stroke="#fff" strokeWidth={2}
                      label={{ value: "★ Mejor día", position: "top", fill: COLOR_GAIN, fontSize: 11, fontWeight: 600 }} />
                    <ReferenceDot x={bestWorstDay.worst.date} y={bestWorstDay.worst.v} r={9} fill={COLOR_LOSS} fillOpacity={0.15} stroke="none" />
                    <ReferenceDot x={bestWorstDay.worst.date} y={bestWorstDay.worst.v} r={5} fill={COLOR_LOSS} stroke="#fff" strokeWidth={2}
                      label={{ value: "▽ Peor día", position: "bottom", fill: COLOR_LOSS, fontSize: 11, fontWeight: 600 }} />
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
          )}

          <div className="perf-stats">
            <div className={clsx("perf-stat-card", data.twr >= 0 ? "is-gain" : "is-loss")}>
              <div className="perf-stat-label">TWR — Time-Weighted Return</div>
              <div className="perf-stat-value" style={{ color: data.twr >= 0 ? COLOR_GAIN : COLOR_LOSS }}>
                {data.twr >= 0 ? "+" : ""}{data.twr.toFixed(2)}%
              </div>
              <div className="perf-stat-caption">
                Rendimiento puro de tus inversiones — ignora cuándo depositaste. Responde: ¿qué tan buenas fueron mis decisiones?
              </div>
            </div>
            <div className={clsx("perf-stat-card", data.mwr >= 0 ? "is-gain" : "is-loss")}>
              <div className="perf-stat-label">MWR — Money-Weighted Return</div>
              <div className="perf-stat-value" style={{ color: data.mwr >= 0 ? COLOR_GAIN : COLOR_LOSS }}>
                {data.mwr >= 0 ? "+" : ""}{data.mwr.toFixed(2)}%
              </div>
              <div className="perf-stat-caption">
                Tu rendimiento real como inversionista — penaliza aportes mal cronometrados. Responde: ¿cuánto gané yo en realidad?
              </div>
            </div>
          </div>
        </>
      )}
    </div>
    </div>
  );
}
