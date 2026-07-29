"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { Holding, PortfolioSummary, Transaction, TransactionType } from "@/types";
import { PortfolioSummaryCards } from "@/components/modules/PortfolioSummary";
import { HoldingsTable } from "@/components/modules/HoldingsTable";
import { TransactionForm } from "@/components/modules/TransactionForm";
import { CsvImporter } from "@/components/modules/CsvImporter";
import { PerformanceChart } from "@/components/modules/PerformanceChart";
import { buildSectorAllocation, formatCurrency, formatShares } from "@/lib/finance/calculations";
import { RefreshCw, Upload, PlusCircle, X, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import "./dashboard.css";

type Modal = "transaction" | "csv" | null;

interface PortfolioData {
  holdings: Holding[];
  summary: PortfolioSummary | null;
  transactions: Transaction[];
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
  const [data, setData] = useState<PortfolioData>({
    holdings: [],
    summary: null,
    transactions: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [marketOpen, setMarketOpen] = useState(false);

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
    setMarketOpen(isUSMarketOpen());
    const dataInterval = setInterval(() => loadPortfolio(true), 60_000);
    const clockInterval = setInterval(() => setMarketOpen(isUSMarketOpen()), 60_000);
    return () => {
      clearInterval(dataInterval);
      clearInterval(clockInterval);
    };
  }, [loadPortfolio]);

  function handleTransactionSuccess() {
    setModal(null);
    loadPortfolio(true);
  }

  const isEmpty = !isLoading && data.holdings.length === 0 && !data.summary;

  const sectorAllocation = useMemo(() => {
    if (!data.summary) return [];
    return buildSectorAllocation(data.holdings, data.summary.cashAvailable);
  }, [data.holdings, data.summary]);

  const recentTransactions = useMemo(() => {
    return [...data.transactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 8);
  }, [data.transactions]);

  return (
    <div>
      {/* ─── Nav ────────────────────────────────────────────── */}
      <header className="nav">
        <div className="nav-brand" style={{ fontStyle: "italic" }}>Portfolio Tracker</div>
        <a href="#" aria-current="page">Dashboard</a>
        <a href="#" onClick={(e) => e.preventDefault()}>Portafolio</a>
        <a href="#" onClick={(e) => e.preventDefault()}>Transacciones</a>
        <a href="#" onClick={(e) => e.preventDefault()}>Watchlist</a>
        <span className="status-pill">
          <span className={clsx("status-dot", !marketOpen && "closed")}></span>
          {marketOpen ? "Mercado abierto" : "Mercado cerrado"}
        </span>

        <button
          className="btn btn-icon icon-btn"
          aria-label="Actualizar precios"
          onClick={() => loadPortfolio(true)}
          disabled={isRefreshing}
        >
          <RefreshCw size={16} color="var(--color-accent)" className={clsx(isRefreshing && "animate-spin")} />
        </button>
        <button className="btn btn-icon icon-btn" aria-label="Importar CSV" onClick={() => setModal("csv")}>
          <Upload size={16} color="var(--color-accent)" />
        </button>
        <button className="btn btn-icon icon-btn" aria-label="Nueva transacción" onClick={() => setModal("transaction")}>
          <PlusCircle size={16} color="var(--color-accent)" />
        </button>

        <button className="btn btn-icon icon-btn" aria-label="Buscar">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="10" r="6.5" fill="none" stroke="var(--color-accent)" strokeWidth="2"></circle><line x1="20" y1="20" x2="15.8" y2="15.8" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round"></line></svg>
        </button>
        <button className="btn btn-icon icon-btn" aria-label="Notificaciones">
          <svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" fill="var(--color-accent)" fillOpacity="0.22" stroke="var(--color-accent)" strokeWidth="1.6" strokeLinejoin="round"></path><path d="M13.73 21a2 2 0 0 1-3.46 0" fill="none" stroke="var(--color-accent)" strokeWidth="1.6"></path></svg>
        </button>
        <button className="btn btn-icon icon-btn" aria-label="Cuenta">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" fill="var(--color-accent)" fillOpacity="0.22" stroke="var(--color-accent)" strokeWidth="1.6"></circle><path d="M4 21c0-4 4-6 8-6s8 2 8 6" fill="none" stroke="var(--color-accent)" strokeWidth="1.6" strokeLinecap="round"></path></svg>
        </button>
      </header>

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

          {/* ─── Posiciones + Distribución ────────────────── */}
          <div className="grid-main">
            <div>
              <div className="row-hd">
                <h3 style={{ margin: 0 }}>Posiciones</h3>
                <a href="#" onClick={(e) => e.preventDefault()}>Ver todas</a>
              </div>
              <HoldingsTable holdings={data.holdings} isLoading={isLoading} />
            </div>

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
                  <span>Mejor activo (30d)</span>
                  <span className="text-muted">—</span>
                </div>
                <div className="qs-row">
                  <span>Peor activo (30d)</span>
                  <span className="text-muted">—</span>
                </div>
                <div className="qs-row">
                  <span>Costo base total</span>
                  <span>{formatCurrency(data.summary?.totalInvested ?? 0)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ─── Transacciones recientes ──────────────────── */}
          <div className="layout txn-wrap">
            <div className="row-hd">
              <h3 style={{ margin: 0 }}>Transacciones recientes</h3>
              <a href="#" onClick={(e) => e.preventDefault()}>Historial completo</a>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th><th>Tipo</th><th>Activo</th>
                  <th className="num">Cantidad</th><th className="num">Precio</th><th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {recentTransactions.map((tx) => {
                  const isTrade = tx.type === "BUY" || tx.type === "SELL";
                  const total = isTrade ? tx.shares * tx.price : tx.price;
                  return (
                    <tr key={tx.id}>
                      <td>{formatTxDate(tx.date)}</td>
                      <td><span className={clsx("tag", TYPE_TAG_CLASS[tx.type])}>{TYPE_LABELS[tx.type]}</span></td>
                      <td>{tx.ticker}</td>
                      <td className="num">{isTrade ? formatShares(tx.shares) : "—"}</td>
                      <td className="num">{isTrade ? formatCurrency(tx.price) : "—"}</td>
                      <td className="num">{formatCurrency(total)}</td>
                    </tr>
                  );
                })}
                {recentTransactions.length === 0 && (
                  <tr><td colSpan={6} className="empty-note">Sin transacciones todavía.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ─── Modales ────────────────────────────────────────── */}
      {modal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={modal === "transaction" ? "Nueva transacción" : "Importar CSV"}
          className="dialog-backdrop"
          onClick={() => setModal(null)}
        >
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 className="dialog-title" style={{ margin: 0 }}>
                {modal === "transaction" ? "Nueva transacción" : "Importar desde CSV"}
              </h3>
              <button onClick={() => setModal(null)} className="btn btn-icon" aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>

            {modal === "transaction" ? (
              <TransactionForm onSuccess={handleTransactionSuccess} />
            ) : (
              <CsvImporter onSuccess={handleTransactionSuccess} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
