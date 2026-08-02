"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { Holding, ClosedPosition, PortfolioSummary, Transaction, TransactionType, BrokerFunding, TrmQuote } from "@/types";
import { PortfolioSummaryCards } from "@/components/modules/PortfolioSummary";
import { HoldingsTable, type PositionRow } from "@/components/modules/HoldingsTable";
import { TransactionForm } from "@/components/modules/TransactionForm";
import { CsvImporter } from "@/components/modules/CsvImporter";
import { FundingCsvImporter } from "@/components/modules/FundingCsvImporter";
import { BrokerFundingForm } from "@/components/modules/BrokerFundingForm";
import { DepositsTable } from "@/components/modules/DepositsTable";
import { PesosCOP } from "@/components/modules/PesosCOP";
import { PesosCOPChart } from "@/components/modules/PesosCOPChart";
import { DepositsAnalytics } from "@/components/modules/DepositsAnalytics";
import { SearchBar } from "@/components/modules/SearchBar";
import { StockDetailModal } from "@/components/modules/StockDetailModal";
import { WatchlistView } from "@/components/modules/WatchlistView";
import { PerformanceChart } from "@/components/modules/PerformanceChart";
import { BestWorstAsset } from "@/components/modules/BestWorstAsset";
import { ReturnBreakdown } from "@/components/modules/ReturnBreakdown";
import { MarketIndices } from "@/components/modules/MarketIndices";
import { buildSectorAllocation, formatCurrency, formatShares, formatPercent } from "@/lib/finance/calculations";
import { RefreshCw, Upload, PlusCircle, Landmark, X, Loader2, Trash2, LogOut } from "lucide-react";
import { clsx } from "clsx";
import "./dashboard.css";

type Modal = "transaction" | "csv" | "fondeo" | null;
type View = "portafolio" | "pesos-cop" | "watchlist";

interface PortfolioData {
  holdings: Holding[];
  summary: PortfolioSummary | null;
  transactions: Transaction[];
  closedPositions: ClosedPosition[];
}

function holdingToRow(h: Holding): PositionRow {
  return {
    ticker: h.ticker,
    companyName: h.companyName,
    isOpen: true,
    shares: h.shares,
    avgCost: h.avgCost,
    weight: h.weight,
    currentPrice: h.currentPrice,
    dailyChange: h.dailyChange,
    dailyChangePct: h.dailyChangePct,
    currentValue: h.currentValue,
    unrealizedPnL: h.unrealizedPnL,
    totalPnL: h.totalPnL,
    realizedPnL: h.realizedPnL,
    nextEarningsDate: h.nextEarningsDate,
    earningsTiming: h.earningsTiming,
    postMarketChangeValue: h.postMarketChange !== null ? h.postMarketChange * h.shares : null,
    postMarketChangePct: h.postMarketChangePct,
  };
}

function closedToRow(c: ClosedPosition): PositionRow {
  return {
    ticker: c.ticker,
    companyName: c.companyName,
    isOpen: false,
    shares: 0,
    avgCost: null,
    weight: null,
    currentPrice: null,
    dailyChange: null,
    dailyChangePct: null,
    currentValue: null,
    unrealizedPnL: null,
    totalPnL: c.realizedPnL,
    realizedPnL: c.realizedPnL,
    nextEarningsDate: null,
    earningsTiming: null,
    postMarketChangeValue: null,
    postMarketChangePct: null,
  };
}

const TYPE_LABELS: Record<TransactionType, string> = {
  BUY: "Compra", SELL: "Venta", DIVIDEND: "Dividendo",
  DEPOSIT: "Depósito", WITHDRAWAL: "Retiro", FEE: "Comisión", INTEREST: "Interés",
};

const TYPE_TAG_CLASS: Record<TransactionType, string> = {
  BUY: "tag-accent", SELL: "tag-accent-2", DIVIDEND: "tag-outline",
  DEPOSIT: "tag-neutral", WITHDRAWAL: "tag-neutral", FEE: "tag-neutral", INTEREST: "tag-neutral",
};

function formatTxDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d
    .toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })
    .replace(".", "");
}

// Aproximación por horario NYSE (9:30–16:00 America/New_York, lun-vie).
// No contempla feriados del mercado.
function isUSMarketOpen(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  if (weekday === "Sat" || weekday === "Sun") return false;
  const minutesSinceMidnight = hour * 60 + minute;
  return minutesSinceMidnight >= 9 * 60 + 30 && minutesSinceMidnight < 16 * 60;
}

export default function DashboardPage() {
  const router = useRouter();
  const [supabase] = useState(() => createBrowserSupabaseClient());
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [data, setData] = useState<PortfolioData>({
    holdings: [],
    summary: null,
    transactions: [],
    closedPositions: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [marketOpen, setMarketOpen] = useState(false);
  const [showAllHoldings, setShowAllHoldings] = useState(false);
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [showClosedPositions, setShowClosedPositions] = useState(false);
  const [view, setView] = useState<View>("portafolio");
  const [trm, setTrm] = useState<TrmQuote | null>(null);
  const [fundings, setFundings] = useState<BrokerFunding[]>([]);
  const [isFundingsLoading, setIsFundingsLoading] = useState(true);
  const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set());
  const [selectedFundingIds, setSelectedFundingIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<{ kind: "transaction" | "funding"; ids: string[] } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchTicker, setSearchTicker] = useState<string | null>(null);

  const loadCOPData = useCallback(async () => {
    setIsFundingsLoading(true);
    try {
      const [trmRes, fundingsRes] = await Promise.all([
        fetch("/api/trm"),
        fetch("/api/broker-fundings"),
      ]);
      if (trmRes.ok) setTrm(await trmRes.json());
      if (fundingsRes.ok) setFundings(await fundingsRes.json());
    } catch (err) {
      console.error("[Dashboard] Pesos COP:", err);
    } finally {
      setIsFundingsLoading(false);
    }
  }, []);

  const loadPortfolio = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);
    setError(null);

    try {
      const res = await fetch("/api/portfolio");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: PortfolioData = await res.json();
      setData(json);
    } catch (err) {
      setError("No se pudo cargar el portafolio. Verifica tu conexión.");
      console.error("[Dashboard]", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadPortfolio();
    loadCOPData();
    setMarketOpen(isUSMarketOpen());
    const dataInterval = setInterval(() => loadPortfolio(true), 60_000);
    const clockInterval = setInterval(() => setMarketOpen(isUSMarketOpen()), 60_000);
    return () => {
      clearInterval(dataInterval);
      clearInterval(clockInterval);
    };
  }, [loadPortfolio, loadCOPData]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null));
  }, [supabase]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function handleTransactionSuccess() {
    setModal(null);
    loadPortfolio(true);
  }

  function handleFundingSuccess() {
    setModal(null);
    loadPortfolio(true); // el fondeo crea un depósito USD normal
    loadCOPData();
  }

  function toggleTxSelect(id: string) {
    setSelectedTxIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleFundingSelect(id: string) {
    setSelectedFundingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function requestDeleteTx(id: string) {
    setConfirmDelete({ kind: "transaction", ids: [id] });
  }

  function requestDeleteSelectedTx() {
    if (selectedTxIds.size === 0) return;
    setConfirmDelete({ kind: "transaction", ids: [...selectedTxIds] });
  }

  function requestDeleteFunding(id: string) {
    setConfirmDelete({ kind: "funding", ids: [id] });
  }

  function requestDeleteSelectedFundings() {
    if (selectedFundingIds.size === 0) return;
    setConfirmDelete({ kind: "funding", ids: [...selectedFundingIds] });
  }

  async function performDelete() {
    if (!confirmDelete) return;
    setIsDeleting(true);
    const endpoint = confirmDelete.kind === "transaction" ? "/api/transactions" : "/api/broker-fundings";
    try {
      await Promise.all(
        confirmDelete.ids.map((id) => fetch(`${endpoint}/${id}`, { method: "DELETE" }))
      );
      if (confirmDelete.kind === "transaction") {
        setSelectedTxIds(new Set());
      } else {
        setSelectedFundingIds(new Set());
      }
      await Promise.all([loadPortfolio(true), loadCOPData()]);
    } catch (err) {
      console.error("[Dashboard] delete", err);
    } finally {
      setIsDeleting(false);
      setConfirmDelete(null);
    }
  }

  const totalFeesCop = useMemo(() => fundings.reduce((s, f) => s + f.fee_cop, 0), [fundings]);
  const totalCopEnviado = useMemo(() => fundings.reduce((s, f) => s + f.usd_amount * f.trm, 0), [fundings]);

  const isEmpty = !isLoading && data.holdings.length === 0 && !data.summary;

  const sectorAllocation = useMemo(() => {
    if (!data.summary) return [];
    return buildSectorAllocation(data.holdings, data.summary.cashAvailable);
  }, [data.holdings, data.summary]);

  const sortedTransactions = useMemo(() => {
    return [...data.transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [data.transactions]);

  const positionRows = useMemo(() => {
    const open = data.holdings.map(holdingToRow);
    if (!showClosedPositions) return open;
    return [...open, ...data.closedPositions.map(closedToRow)];
  }, [data.holdings, data.closedPositions, showClosedPositions]);

  const HOLDINGS_PREVIEW = 10;
  const TRANSACTIONS_PREVIEW = 8;
  const visibleHoldings = showAllHoldings ? positionRows : positionRows.slice(0, HOLDINGS_PREVIEW);
  const visibleTransactions = showAllTransactions ? sortedTransactions : sortedTransactions.slice(0, TRANSACTIONS_PREVIEW);
  const allTxSelected = visibleTransactions.length > 0 && visibleTransactions.every((t) => selectedTxIds.has(t.id));

  function toggleTxSelectAll(checked: boolean) {
    setSelectedTxIds(checked ? new Set(visibleTransactions.map((t) => t.id)) : new Set());
  }

  function toggleFundingSelectAll(checked: boolean) {
    setSelectedFundingIds(checked ? new Set(fundings.map((f) => f.id)) : new Set());
  }

  return (
    <div>
      {/* ─── Nav ────────────────────────────────────────────── */}
      <header className="nav">
        <div className="nav-brand" style={{ fontStyle: "italic" }}>Portfolio Tracker</div>
        <a href="#" aria-current={view === "portafolio" ? "page" : undefined} onClick={(e) => { e.preventDefault(); setView("portafolio"); }}>
          Portafolio
        </a>
        <a href="#" aria-current={view === "pesos-cop" ? "page" : undefined} onClick={(e) => { e.preventDefault(); setView("pesos-cop"); }}>
          Pesos COP
        </a>
        <a href="#" onClick={(e) => e.preventDefault()}>Transacciones</a>
        <a href="#" aria-current={view === "watchlist" ? "page" : undefined} onClick={(e) => { e.preventDefault(); setView("watchlist"); }}>
          Watchlist
        </a>
        <SearchBar onSelect={setSearchTicker} />
        <span className="status-pill">
          <span className={clsx("status-dot", !marketOpen && "closed")}></span>
          {marketOpen ? "Mercado abierto" : "Mercado cerrado"}
        </span>

        <button
          className="btn btn-icon icon-btn"
          aria-label="Actualizar precios"
          title="Actualizar precios"
          onClick={() => loadPortfolio(true)}
          disabled={isRefreshing}
        >
          <RefreshCw size={16} color="var(--color-accent)" className={clsx(isRefreshing && "animate-spin")} />
        </button>
        <button className="btn btn-icon icon-btn" aria-label="Importar CSV" title="Importar CSV" onClick={() => setModal("csv")}>
          <Upload size={16} color="var(--color-accent)" />
        </button>
        {view === "portafolio" && (
          <button className="btn btn-icon icon-btn" aria-label="Nueva transacción" title="Nueva transacción" onClick={() => setModal("transaction")}>
            <PlusCircle size={16} color="var(--color-accent)" />
          </button>
        )}
        {view === "pesos-cop" && (
          <button className="btn btn-icon icon-btn" aria-label="Fondeo broker" title="Fondeo broker" onClick={() => setModal("fondeo")}>
            <Landmark size={16} color="var(--color-accent)" />
          </button>
        )}

        {userEmail && (
          <span className="text-muted" style={{ fontSize: 12, marginLeft: "var(--space-2)" }} title={userEmail}>
            {userEmail}
          </span>
        )}
        <button className="btn btn-icon icon-btn" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={handleSignOut}>
          <LogOut size={16} color="var(--color-accent)" />
        </button>
      </header>

      {view === "portafolio" && (
      <>
      {/* ─── Mercados ───────────────────────────────────────── */}
      <MarketIndices />

      {/* ─── Error global ──────────────────────────────────── */}
      {error && (
        <div role="alert" className="layout" style={{ paddingTop: "var(--space-2)" }}>
          <p className="tag tag-loss" style={{ display: "flex", alignItems: "center", gap: 8, width: "fit-content" }}>
            {error}
            <button onClick={() => setError(null)} className="btn btn-icon" style={{ width: 20, height: 20 }} aria-label="Cerrar">
              <X size={12} />
            </button>
          </p>
        </div>
      )}

      {/* ─── Estado vacío ──────────────────────────────────── */}
      {isEmpty && !error && (
        <div className="empty-dashboard">
          <div>
            <h3 style={{ margin: 0 }}>Tu portafolio está vacío</h3>
            <p className="text-muted" style={{ marginTop: 4 }}>
              Agrega transacciones manualmente o importa un CSV para empezar.
            </p>
          </div>
          <div style={{ display: "flex", gap: "var(--space-3)" }}>
            <button onClick={() => setModal("csv")} className="btn btn-secondary">
              <Upload size={14} />Importar CSV
            </button>
            <button onClick={() => setModal("transaction")} className="btn btn-primary">
              <PlusCircle size={14} />Primera transacción
            </button>
          </div>
        </div>
      )}

      {/* ─── Resumen ────────────────────────────────────────── */}
      {data.summary && !isEmpty && <PortfolioSummaryCards summary={data.summary} />}
      {isLoading && !data.summary && !isEmpty && (
        <div className="summary">
          {[...Array(3)].map((_, i) => (
            <div key={i}>
              <div className="kicker">&nbsp;</div>
              <div className="big-num" style={{ opacity: 0.15 }}>···</div>
            </div>
          ))}
        </div>
      )}

      {(!isEmpty || isLoading) && (
        <>
          {/* ─── Evolución del valor ──────────────────────── */}
          <PerformanceChart />

          {/* ─── Distribución + Mejor/Peor activo ──────────── */}
          <div className="grid-split">
            <div>
              <div className="row-hd">
                <h3 style={{ margin: 0 }}>Distribución</h3>
              </div>
              <div>
                {sectorAllocation.length === 0 ? (
                  <p className="empty-note">Aún no hay posiciones para calcular la distribución.</p>
                ) : (
                  sectorAllocation.map((s) => (
                    <div className="alloc-row" key={s.name}>
                      <span className="alloc-name">{s.name}</span>
                      <div className="alloc-bar">
                        <span style={{ width: `${Math.min(s.pct, 100)}%` }}></span>
                      </div>
                      <span className="alloc-pct">{s.pct.toFixed(1)}%</span>
                    </div>
                  ))
                )}
              </div>

              <div className="quick-stats">
                <div className="qs-row">
                  <span>Posiciones abiertas</span>
                  <span>{data.summary?.holdingsCount ?? 0}</span>
                </div>
                <div className="qs-row">
                  <span>Costo base total</span>
                  <span>{formatCurrency(data.summary?.totalInvested ?? 0)}</span>
                </div>
              </div>
            </div>

            <div>
              <div className="row-hd">
                <h3 style={{ margin: 0 }}>Mejor / peor activo</h3>
              </div>
              <div className="quick-stats" style={{ marginTop: 0 }}>
                <BestWorstAsset />
              </div>

              <div className="kicker" style={{ marginTop: "var(--space-4)" }}>Desglose del rendimiento</div>
              <ReturnBreakdown summary={data.summary} />
            </div>
          </div>

          {/* ─── Posiciones (ancho completo) ───────────────── */}
          <div className="layout">
            <div className="row-hd">
              <h3 style={{ margin: 0 }}>Posiciones</h3>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
                {data.closedPositions.length > 0 && (
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={showClosedPositions}
                      onChange={(e) => setShowClosedPositions(e.target.checked)}
                    />
                    <span className="track" aria-hidden="true"></span>
                    Mostrar posiciones vendidas ({data.closedPositions.length})
                  </label>
                )}
                {positionRows.length > HOLDINGS_PREVIEW && (
                  <a href="#" onClick={(e) => { e.preventDefault(); setShowAllHoldings((v) => !v); }}>
                    {showAllHoldings ? "Ver menos" : `Ver todas (${positionRows.length})`}
                  </a>
                )}
              </div>
            </div>
            <HoldingsTable rows={visibleHoldings} isLoading={isLoading} onSelectTicker={setSearchTicker} />
          </div>

          {/* ─── Transacciones recientes ──────────────────── */}
          <div className="layout txn-wrap">
            <div className="row-hd">
              <h3 style={{ margin: 0 }}>{showAllTransactions ? "Historial completo" : "Transacciones recientes"}</h3>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                {selectedTxIds.size > 0 && (
                  <button
                    className="btn btn-danger"
                    style={{ padding: "5px 10px", fontSize: 12 }}
                    onClick={requestDeleteSelectedTx}
                  >
                    <Trash2 size={13} />Eliminar ({selectedTxIds.size})
                  </button>
                )}
                {sortedTransactions.length > TRANSACTIONS_PREVIEW && (
                  <a href="#" onClick={(e) => { e.preventDefault(); setShowAllTransactions((v) => !v); }}>
                    {showAllTransactions ? "Ver menos" : `Historial completo (${sortedTransactions.length})`}
                  </a>
                )}
              </div>
            </div>
            <div style={showAllTransactions ? { maxHeight: 480, overflowY: "auto" } : undefined}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 28 }}>
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todas las transacciones"
                        checked={allTxSelected}
                        onChange={(e) => toggleTxSelectAll(e.target.checked)}
                      />
                    </th>
                    <th>Fecha</th><th>Tipo</th><th>Activo</th>
                    <th className="num">Cantidad</th><th className="num">Precio</th><th className="num">Total</th>
                    <th style={{ width: 36 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTransactions.map((tx) => {
                    const isTrade = tx.type === "BUY" || tx.type === "SELL";
                    const total = isTrade ? tx.shares * tx.price : tx.price;
                    return (
                      <tr key={tx.id}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Seleccionar transacción ${tx.ticker}`}
                            checked={selectedTxIds.has(tx.id)}
                            onChange={() => toggleTxSelect(tx.id)}
                          />
                        </td>
                        <td>{formatTxDate(tx.date)}</td>
                        <td><span className={clsx("tag", TYPE_TAG_CLASS[tx.type])}>{TYPE_LABELS[tx.type]}</span></td>
                        <td>{tx.ticker}</td>
                        <td className="num">{isTrade ? formatShares(tx.shares) : "—"}</td>
                        <td className="num">{isTrade ? formatCurrency(tx.price) : "—"}</td>
                        <td className="num">{formatCurrency(total)}</td>
                        <td>
                          <button
                            className="btn btn-icon btn-icon-sm"
                            aria-label="Eliminar transacción"
                            onClick={() => requestDeleteTx(tx.id)}
                          >
                            <Trash2 size={14} color="var(--color-loss)" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {visibleTransactions.length === 0 && (
                    <tr><td colSpan={8} className="empty-note">Sin transacciones todavía.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      </>
      )}

      {/* ─── Pesos COP ──────────────────────────────────────── */}
      {view === "pesos-cop" && (
        <>
          <PesosCOP
            summary={data.summary}
            trm={trm}
            totalFeesCop={totalFeesCop}
            totalCopEnviado={totalCopEnviado}
            isLoading={isFundingsLoading}
          />

          <PesosCOPChart />

          <DepositsAnalytics fundings={fundings} />

          <div className="layout txn-wrap">
            <div className="row-hd">
              <h3 style={{ margin: 0 }}>Historial de depósitos</h3>
              {selectedFundingIds.size > 0 && (
                <button
                  className="btn btn-danger"
                  style={{ padding: "5px 10px", fontSize: 12 }}
                  onClick={requestDeleteSelectedFundings}
                >
                  <Trash2 size={13} />Eliminar ({selectedFundingIds.size})
                </button>
              )}
            </div>
            <DepositsTable
              fundings={fundings}
              isLoading={isFundingsLoading}
              selectedIds={selectedFundingIds}
              onToggleOne={toggleFundingSelect}
              onToggleAll={toggleFundingSelectAll}
              onDeleteOne={requestDeleteFunding}
            />
          </div>
        </>
      )}

      {/* ─── Watchlist ──────────────────────────────────────── */}
      {view === "watchlist" && <WatchlistView onSelectTicker={setSearchTicker} />}

      {/* ─── Modales ────────────────────────────────────────── */}
      {modal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={modal === "transaction" ? "Nueva transacción" : modal === "fondeo" ? "Fondeo broker" : view === "pesos-cop" ? "Importar CSV de fondeos" : "Importar CSV de transacciones"}
          className="dialog-backdrop"
          onClick={() => setModal(null)}
        >
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 className="dialog-title" style={{ margin: 0 }}>
                {modal === "transaction"
                  ? "Nueva transacción"
                  : modal === "fondeo"
                    ? "Fondeo broker"
                    : view === "pesos-cop"
                      ? "Importar fondeos desde CSV"
                      : "Importar transacciones desde CSV"}
              </h3>
              <button onClick={() => setModal(null)} className="btn btn-icon" aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>

            {modal === "transaction" ? (
              <TransactionForm onSuccess={handleTransactionSuccess} />
            ) : modal === "fondeo" ? (
              <BrokerFundingForm onSuccess={handleFundingSuccess} />
            ) : view === "pesos-cop" ? (
              <FundingCsvImporter onSuccess={handleFundingSuccess} />
            ) : (
              <CsvImporter onSuccess={handleTransactionSuccess} />
            )}
          </div>
        </div>
      )}

      {/* ─── Confirmación de borrado ─────────────────────────── */}
      {confirmDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar eliminación"
          className="dialog-backdrop"
          onClick={() => !isDeleting && setConfirmDelete(null)}
        >
          <div className="dialog" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <h3 className="dialog-title" style={{ margin: 0 }}>
              {confirmDelete.ids.length > 1
                ? `¿Eliminar ${confirmDelete.ids.length} ${confirmDelete.kind === "transaction" ? "transacciones" : "fondeos"}?`
                : confirmDelete.kind === "transaction"
                  ? "¿Desea eliminar esta transacción?"
                  : "¿Desea eliminar este fondeo?"}
            </h3>
            <p className="dialog-body">
              Esta acción no se puede deshacer.
              {confirmDelete.kind === "funding" && " Si el fondeo tiene un depósito vinculado en el portafolio USD, también se eliminará."}
            </p>
            <div className="dialog-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)} disabled={isDeleting}>
                Cancelar
              </button>
              <button className="btn btn-danger" onClick={performDelete} disabled={isDeleting}>
                {isDeleting && <Loader2 size={14} className="animate-spin" />}
                {isDeleting ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Detalle de acción (buscador) ────────────────────── */}
      {searchTicker && (
        <StockDetailModal
          ticker={searchTicker}
          onClose={() => setSearchTicker(null)}
          onSelectTicker={setSearchTicker}
        />
      )}
    </div>
  );
}
