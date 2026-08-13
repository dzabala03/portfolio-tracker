"use client";

import type { PortfolioSummary, TrmQuote } from "@/types";
import { clsx } from "clsx";
import { PriceAlertsPanel } from "@/components/modules/PriceAlertsPanel";

interface Props {
  summary: PortfolioSummary | null;
  trm: TrmQuote | null;
  totalFeesCop: number;
  totalCopEnviado: number;
  isLoading?: boolean;
}

function formatCOP(value: number): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.round(Math.abs(value)).toLocaleString("es-CO")}`;
}

export function PesosCOP({ summary, trm, totalFeesCop, totalCopEnviado, isLoading }: Props) {
  const trmUp = (trm?.change ?? 0) >= 0;

  const valorTotalCop = (summary?.totalNetWorth ?? 0) * (trm?.value ?? 0);
  const rendimientoPortafolioCop = (summary?.totalReturn ?? 0) * (trm?.value ?? 0);
  const rendimientoTotalCop = rendimientoPortafolioCop - totalFeesCop;
  const efectivoCop = (summary?.cashAvailable ?? 0) * (trm?.value ?? 0);

  // "Con efecto de la TRM": compara el valor de hoy (a la TRM de hoy)
  // contra los pesos que REALMENTE se enviaron (cada fondeo a su propia
  // TRM histórica) — a diferencia de las tarjetas de arriba, que solo
  // convierten el rendimiento en USD con la TRM de hoy, esto también
  // captura cuánto ganaste o perdiste por el movimiento de la TRM entre
  // cada fondeo y hoy.
  const rendimientoPortafolioConTrm = valorTotalCop - totalCopEnviado;
  const rendimientoTotalConTrm = rendimientoPortafolioConTrm - totalFeesCop;

  return (
    <div className="layout">
      {/* ─── TRM ────────────────────────────────────────────── */}
      <div className="kicker" style={{ marginBottom: "var(--space-2)" }}>Tasa representativa del mercado</div>
      <div className="card market-index-card" style={{ width: 260, marginBottom: "var(--space-6)" }}>
        <span className="card-kicker">TRM hoy</span>
        {trm ? (
          <>
            <span className="num" style={{ fontSize: 22, fontWeight: 600 }}>{formatCOP(trm.value)}</span>
            <span className={clsx("num", trmUp ? "gain" : "loss")} style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
              {trmUp ? "▲" : "▼"}
              {trmUp ? "+" : ""}{trm.change.toFixed(2)} ({trmUp ? "+" : ""}{trm.changePct.toFixed(2)}%) hoy
            </span>
            <span className="text-muted" style={{ fontSize: 10 }}>Superintendencia Financiera de Colombia</span>
          </>
        ) : (
          <span className="text-muted" style={{ fontSize: 12 }}>{isLoading ? "Cargando…" : "Sin dato"}</span>
        )}
      </div>

      <div style={{ marginBottom: "var(--space-6)" }}>
        <PriceAlertsPanel kind="trm" />
      </div>

      {/* ─── Fila 1: sin efecto de la TRM ──────────────────── */}
      <div className="kicker">Sin efecto de la TRM</div>
      <div className="cop-summary">
        <div>
          <div className="kicker">Total depositado</div>
          <div className="big-num" style={{ fontSize: 30 }}>{formatCOP(totalCopEnviado)}</div>
          <div className="delta delta-muted">COP enviado a la TRM de cada fondeo</div>
        </div>
        <div>
          <div className="kicker">Valor total del portafolio</div>
          <div className="big-num" style={{ fontSize: 30 }}>{formatCOP(valorTotalCop)}</div>
          <div className="delta delta-muted">COP</div>
        </div>
        <div>
          <div className="kicker">Rendimiento portafolio</div>
          <div className={clsx("big-num", rendimientoPortafolioCop >= 0 ? "gain" : "loss")} style={{ fontSize: 30 }}>
            {rendimientoPortafolioCop >= 0 ? "+" : ""}{formatCOP(rendimientoPortafolioCop)}
          </div>
          <div className="delta delta-muted">antes de comisiones de fondeo</div>
        </div>
        <div>
          <div className="kicker">Rendimiento total</div>
          <div className={clsx("big-num", rendimientoTotalCop >= 0 ? "gain" : "loss")} style={{ fontSize: 30 }}>
            {rendimientoTotalCop >= 0 ? "+" : ""}{formatCOP(rendimientoTotalCop)}
          </div>
          <div className="delta delta-muted">
            {totalFeesCop > 0 ? `descontando ${formatCOP(totalFeesCop)} en comisiones` : "sin comisiones registradas"}
          </div>
        </div>
        <div>
          <div className="kicker">Efectivo disponible</div>
          <div className="big-num" style={{ fontSize: 30 }}>{formatCOP(efectivoCop)}</div>
          <div className="delta delta-muted">COP</div>
        </div>
      </div>

      {/* ─── Fila 2: con efecto de la TRM ──────────────────── */}
      <div className="kicker" style={{ marginTop: "var(--space-2)" }}>Con efecto de la TRM</div>
      <div className="cop-summary">
        <div>
          <div className="kicker">Rendimiento portafolio</div>
          <div className={clsx("big-num", rendimientoPortafolioConTrm >= 0 ? "gain" : "loss")} style={{ fontSize: 30 }}>
            {rendimientoPortafolioConTrm >= 0 ? "+" : ""}{formatCOP(rendimientoPortafolioConTrm)}
          </div>
          <div className="delta delta-muted">valor de hoy − COP enviado</div>
        </div>
        <div>
          <div className="kicker">Rendimiento total</div>
          <div className={clsx("big-num", rendimientoTotalConTrm >= 0 ? "gain" : "loss")} style={{ fontSize: 30 }}>
            {rendimientoTotalConTrm >= 0 ? "+" : ""}{formatCOP(rendimientoTotalConTrm)}
          </div>
          <div className="delta delta-muted">
            {totalFeesCop > 0 ? `descontando ${formatCOP(totalFeesCop)} en comisiones` : "sin comisiones registradas"}
          </div>
        </div>
      </div>
    </div>
  );
}
