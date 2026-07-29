"use client";

import type { Holding } from "@/types";
import { formatCurrency, formatPercent, formatShares } from "@/lib/finance/calculations";
import { clsx } from "clsx";

interface Props {
  holdings: Holding[];
  isLoading?: boolean;
}

function SkeletonRow() {
  return (
    <tr>
      {[...Array(6)].map((_, i) => (
        <td key={i} style={{ padding: "var(--space-2)" }}>
          <div style={{ height: 14, background: "var(--color-neutral-200)", borderRadius: 2, opacity: 0.6 }} />
        </td>
      ))}
    </tr>
  );
}

const COLUMNS = [
  { label: "Activo", align: "left" },
  { label: "Cant.", align: "right" },
  { label: "Precio", align: "right" },
  { label: "Hoy", align: "right" },
  { label: "Valor", align: "right" },
  { label: "P&L", align: "right" },
] as const;

export function HoldingsTable({ holdings, isLoading }: Props) {
  if (!isLoading && holdings.length === 0) {
    return (
      <div className="empty-note">Sin posiciones activas — agrega tu primera transacción para verlas aquí.</div>
    );
  }

  return (
    <table className="table holdings" aria-label="Holdings del portafolio">
      <thead>
        <tr>
          {COLUMNS.map((col) => (
            <th key={col.label} className={col.align === "right" ? "num" : undefined}>
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {isLoading
          ? [...Array(4)].map((_, i) => <SkeletonRow key={i} />)
          : holdings.map((holding) => (
              <tr key={holding.ticker}>
                <td>
                  <strong>{holding.ticker}</strong>
                  <div className="tkr-name">{holding.companyName}</div>
                </td>
                <td className="num">{formatShares(holding.shares)}</td>
                <td className="num">{formatCurrency(holding.currentPrice)}</td>
                <td className={clsx("num", holding.dailyChangePct >= 0 ? "gain" : "loss")}>
                  {formatPercent(holding.dailyChangePct)}
                </td>
                <td className="num">{formatCurrency(holding.currentValue)}</td>
                <td className={clsx("num", holding.unrealizedPnL >= 0 ? "gain" : "loss")}>
                  {holding.unrealizedPnL >= 0 ? "+" : ""}
                  {formatCurrency(holding.unrealizedPnL)}
                </td>
              </tr>
            ))}
      </tbody>
    </table>
  );
}
