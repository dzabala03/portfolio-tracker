"use client";

import type { Holding } from "@/types";
import {
  formatCurrency,
  formatPercent,
  formatShares,
  pnlColorClass,
} from "@/lib/finance/calculations";
import { clsx } from "clsx";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

interface Props {
  holdings: Holding[];
  isLoading?: boolean;
}

function ChangeIcon({ value }: { value: number }) {
  if (value > 0) return <ArrowUpRight size={12} className="text-gain inline" />;
  if (value < 0) return <ArrowDownRight size={12} className="text-loss inline" />;
  return <Minus size={12} className="text-text-muted inline" />;
}

function PnLCell({ value, pct }: { value: number; pct: number }) {
  return (
    <div className="text-right">
      <p className={clsx("font-finance text-sm font-medium", pnlColorClass(value))}>
        <ChangeIcon value={value} />
        {formatCurrency(Math.abs(value))}
      </p>
      <p className={clsx("font-finance text-xs", pnlColorClass(pct))}>
        {formatPercent(pct)}
      </p>
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-t border-border-muted animate-pulse">
      {[...Array(8)].map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-elevated rounded w-3/4" />
        </td>
      ))}
    </tr>
  );
}

const COLUMNS = [
  { label: "Ticker", align: "left" },
  { label: "Acciones", align: "right" },
  { label: "Costo prom.", align: "right" },
  { label: "Precio actual", align: "right" },
  { label: "Valor actual", align: "right" },
  { label: "P&G no real.", align: "right" },
  { label: "Variación día", align: "right" },
  { label: "Peso %", align: "right" },
] as const;

export function HoldingsTable({ holdings, isLoading }: Props) {
  if (!isLoading && holdings.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center py-16 text-center">
        <p className="text-text-secondary text-sm mb-2">Sin posiciones activas</p>
        <p className="text-text-muted text-xs">
          Agrega tu primera transacción para ver tus holdings aquí.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label="Holdings del portafolio">
          <thead>
            <tr className="border-b border-border">
              {COLUMNS.map((col) => (
                <th
                  key={col.label}
                  className={clsx(
                    "px-4 py-3 label whitespace-nowrap",
                    col.align === "right" ? "text-right" : "text-left"
                  )}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {isLoading
              ? [...Array(3)].map((_, i) => <SkeletonRow key={i} />)
              : holdings.map((holding) => (
                  <tr
                    key={holding.ticker}
                    className="border-t border-border-muted hover:bg-elevated transition-colors duration-100"
                  >
                    {/* Ticker + nombre */}
                    <td className="px-4 py-3">
                      <p className="font-semibold text-text-primary tracking-wide">
                        {holding.ticker}
                      </p>
                      <p className="text-text-muted text-xs truncate max-w-[150px]">
                        {holding.companyName}
                      </p>
                    </td>

                    {/* Acciones */}
                    <td className="px-4 py-3 text-right font-finance text-text-secondary">
                      {formatShares(holding.shares)}
                    </td>

                    {/* Costo promedio */}
                    <td className="px-4 py-3 text-right font-finance text-text-secondary">
                      {formatCurrency(holding.avgCost)}
                    </td>

                    {/* Precio actual */}
                    <td className="px-4 py-3 text-right font-finance text-text-primary font-medium">
                      {formatCurrency(holding.currentPrice)}
                    </td>

                    {/* Valor actual */}
                    <td className="px-4 py-3 text-right font-finance text-text-primary font-semibold">
                      {formatCurrency(holding.currentValue)}
                    </td>

                    {/* P&G no realizado */}
                    <td className="px-4 py-3">
                      <PnLCell
                        value={holding.unrealizedPnL}
                        pct={holding.unrealizedPnLPct}
                      />
                    </td>

                    {/* Variación del día */}
                    <td className="px-4 py-3">
                      <PnLCell
                        value={holding.dailyChange}
                        pct={holding.dailyChangePct}
                      />
                    </td>

                    {/* Peso */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-elevated rounded-full overflow-hidden">
                          <div
                            className="h-full bg-accent rounded-full"
                            style={{ width: `${Math.min(holding.weight, 100)}%` }}
                          />
                        </div>
                        <span className="font-finance text-text-secondary text-xs w-10 text-right">
                          {holding.weight.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
