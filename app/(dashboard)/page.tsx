"use client";

import { useState, useEffect, useCallback } from "react";
import type { Holding, PortfolioSummary, Transaction } from "@/types";
import { PortfolioSummaryCards } from "@/components/modules/PortfolioSummary";
import { HoldingsTable } from "@/components/modules/HoldingsTable";
import { TransactionForm } from "@/components/modules/TransactionForm";
import { CsvImporter } from "@/components/modules/CsvImporter";
import {
  RefreshCw,
  PlusCircle,
  Upload,
  X,
  BarChart2,
} from "lucide-react";
import { clsx } from "clsx";

type Modal = "transaction" | "csv" | null;

interface PortfolioData {
  holdings: Holding[];
  summary: PortfolioSummary | null;
  transactions: Transaction[];
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

  // Carga inicial + polling cada 60s
  useEffect(() => {
    loadPortfolio();
    const interval = setInterval(() => loadPortfolio(true), 60_000);
    return () => clearInterval(interval);
  }, [loadPortfolio]);

  function handleTransactionSuccess() {
    setModal(null);
    loadPortfolio(true);
  }

  const isEmpty = !isLoading && data.holdings.length === 0 && !data.summary;

  return (
    <div className="min-h-screen bg-base">
      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="border-b border-border sticky top-0 bg-base/90 backdrop-blur-sm z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart2 size={20} className="text-accent" />
            <span className="font-semibold text-text-primary text-sm tracking-tight">
              Portfolio Tracker
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Botón de refresh */}
            <button
              onClick={() => loadPortfolio(true)}
              disabled={isRefreshing}
              className="btn-ghost p-2"
              title="Actualizar precios"
              aria-label="Actualizar precios"
            >
              <RefreshCw
                size={15}
                className={clsx(isRefreshing && "animate-spin")}
              />
            </button>

            {/* Importar CSV */}
            <button
              onClick={() => setModal("csv")}
              className="btn-ghost flex items-center gap-1.5 text-xs"
            >
              <Upload size={14} />
              <span className="hidden sm:inline">Importar CSV</span>
            </button>

            {/* Nueva transacción */}
            <button
              onClick={() => setModal("transaction")}
              className="btn-primary flex items-center gap-1.5 text-xs"
            >
              <PlusCircle size={14} />
              <span>Nueva transacción</span>
            </button>
          </div>
        </div>
      </header>

      {/* ─── Contenido principal ────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Error global */}
        {error && (
          <div
            role="alert"
            className="bg-loss-subtle border border-loss/20 rounded-lg px-4 py-3 text-loss text-sm flex items-center gap-2"
          >
            <span>⚠</span>
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-loss/60 hover:text-loss">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Estado vacío */}
        {isEmpty && !error && (
          <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
            <BarChart2 size={48} className="text-text-muted" />
            <div>
              <p className="text-text-primary font-medium text-lg">
                Tu portafolio está vacío
              </p>
              <p className="text-text-muted text-sm mt-1">
                Agrega transacciones manualmente o importa un CSV para empezar.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setModal("csv")}
                className="btn-ghost flex items-center gap-2"
              >
                <Upload size={14} />
                Importar CSV
              </button>
              <button
                onClick={() => setModal("transaction")}
                className="btn-primary flex items-center gap-2"
              >
                <PlusCircle size={14} />
                Primera transacción
              </button>
            </div>
          </div>
        )}

        {/* Resumen del portafolio */}
        {(data.summary || isLoading) && !isEmpty && (
          <>
            {data.summary ? (
              <PortfolioSummaryCards summary={data.summary} />
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="card h-28 animate-pulse bg-surface" />
                ))}
              </div>
            )}
          </>
        )}

        {/* Tabla de holdings */}
        {(!isEmpty || isLoading) && (
          <section aria-label="Posiciones activas">
            <h2 className="label mb-3">Posiciones activas</h2>
            <HoldingsTable
              holdings={data.holdings}
              isLoading={isLoading}
            />
          </section>
        )}
      </main>

      {/* ─── Modales ─────────────────────────────────────────── */}
      {modal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={modal === "transaction" ? "Nueva transacción" : "Importar CSV"}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-base/80 backdrop-blur-sm"
            onClick={() => setModal(null)}
            aria-hidden="true"
          />

          {/* Panel */}
          <div className="relative bg-surface border border-border rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
              <h2 className="text-text-primary font-semibold text-sm">
                {modal === "transaction"
                  ? "Nueva transacción"
                  : "Importar desde CSV"}
              </h2>
              <button
                onClick={() => setModal(null)}
                className="text-text-muted hover:text-text-primary transition-colors"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6">
              {modal === "transaction" ? (
                <TransactionForm onSuccess={handleTransactionSuccess} />
              ) : (
                <CsvImporter onSuccess={handleTransactionSuccess} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
