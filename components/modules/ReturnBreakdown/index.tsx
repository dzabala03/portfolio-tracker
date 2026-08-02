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
    <div className="quick-stats">
      {rows.map((r) => (
        <div className="qs-row" key={r.label}>
          <span>{r.label}</span>
          <span className={clsx("num", r.value >= 0 ? "gain" : "loss")}>
            {r.value >= 0 ? "+" : ""}{formatCurrency(r.value)}
          </span>
        </div>
      ))}
      <div className="qs-row" style={{ fontWeight: 600 }}>
        <span>Rendimiento total</span>
        <span className={clsx("num", summary.totalReturn >= 0 ? "gain" : "loss")}>
          {summary.totalReturn >= 0 ? "+" : ""}{formatCurrency(summary.totalReturn)}
        </span>
      </div>
    </div>
  );
}
