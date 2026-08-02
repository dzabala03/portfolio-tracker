"use client";

import type { PortfolioSummary } from "@/types";
import { formatCurrency } from "@/lib/finance/calculations";
import { clsx } from "clsx";

interface Props {
  summary: PortfolioSummary | null;
}

interface Row {
  label: string;
  value: number;
}

export function ReturnBreakdown({ summary }: Props) {
  if (!summary) return null;

  const rows: Row[] = [
    { label: "Valorización de posiciones abiertas", value: summary.totalUnrealizedPnL },
    { label: "Ganancias realizadas (ventas)", value: summary.totalRealizedPnL },
    { label: "Dividendos", value: summary.cashFlow.totalDividends },
    { label: "Intereses", value: summary.cashFlow.totalInterest },
    { label: "Comisiones", value: -summary.cashFlow.totalFees },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--space-3)" }}>
      {rows.map((r) => (
        <div className="card elev-sm" key={r.label}>
          <span className="card-kicker">{r.label}</span>
          <span className={clsx("num", r.value >= 0 ? "gain" : "loss")} style={{ fontSize: 18, fontWeight: 600 }}>
            {r.value >= 0 ? "+" : ""}{formatCurrency(r.value)}
          </span>
        </div>
      ))}
      <div className="card elev-sm" style={{ background: "var(--color-accent-100)" }}>
        <span className="card-kicker">Rendimiento total</span>
        <span className={clsx("num", summary.totalReturn >= 0 ? "gain" : "loss")} style={{ fontSize: 18, fontWeight: 700 }}>
          {summary.totalReturn >= 0 ? "+" : ""}{formatCurrency(summary.totalReturn)}
        </span>
      </div>
    </div>
  );
}
