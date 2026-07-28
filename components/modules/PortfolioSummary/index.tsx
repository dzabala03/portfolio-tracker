"use client";

import type { PortfolioSummary } from "@/types";
import {
  formatCurrency,
  formatPercent,
  pnlColorClass,
} from "@/lib/finance/calculations";
import { TrendingUp, TrendingDown, DollarSign, Activity } from "lucide-react";
import { clsx } from "clsx";

interface Props {
  summary: PortfolioSummary;
}

interface MetricCardProps {
  title: string;
  value: string;
  subValue?: string;
  subLabel?: string;
  colorValue?: number; // si es positivo → verde, negativo → rojo
  icon: React.ReactNode;
  isHighlight?: boolean;
}

function MetricCard({
  title,
  value,
  subValue,
  subLabel,
  colorValue,
  icon,
  isHighlight,
}: MetricCardProps) {
  const isPositive = colorValue !== undefined && colorValue > 0;
  const isNegative = colorValue !== undefined && colorValue < 0;
  const colorClass =
    isPositive ? "text-gain" : isNegative ? "text-loss" : "text-text-primary";
  const bgClass =
    isPositive ? "bg-gain-subtle" : isNegative ? "bg-loss-subtle" : "";

  return (
    <div
      className={clsx(
        "card relative overflow-hidden transition-all duration-300",
        isHighlight && "border-accent/30",
        colorValue !== undefined && (isPositive ? "border-gain/20" : isNegative ? "border-loss/20" : "")
      )}
    >
      {/* Fondo sutil de color en cards P&G */}
      {colorValue !== undefined && (
        <div
          className={clsx("absolute inset-0 opacity-30", bgClass)}
          aria-hidden="true"
        />
      )}

      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <span className="label">{title}</span>
          <span className={clsx("p-1.5 rounded-lg", colorValue !== undefined ? bgClass : "bg-elevated")}>
            {icon}
          </span>
        </div>

        <p
          className={clsx(
            "font-finance text-2xl font-semibold tracking-tight",
            colorValue !== undefined ? colorClass : "text-text-primary"
          )}
        >
          {value}
        </p>

        {subValue && (
          <p className={clsx("font-finance text-sm mt-1", colorValue !== undefined ? colorClass : "text-text-secondary")}>
            {subValue}
            {subLabel && (
              <span className="text-text-muted font-sans font-normal ml-1 text-xs">
                {subLabel}
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

export function PortfolioSummaryCards({ summary }: Props) {
  const DailyIcon =
    summary.totalDailyChange >= 0 ? TrendingUp : TrendingDown;

  return (
    <section aria-label="Resumen del portafolio">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Valor total */}
        <MetricCard
          title="Valor total"
          value={formatCurrency(summary.totalValue)}
          subValue={`${summary.holdingsCount} posición${summary.holdingsCount !== 1 ? "es" : ""}`}
          icon={<DollarSign size={16} className="text-accent" />}
          isHighlight
        />

        {/* Variación del día */}
        <MetricCard
          title="Hoy"
          value={formatCurrency(summary.totalDailyChange)}
          subValue={formatPercent(summary.totalDailyChangePct)}
          colorValue={summary.totalDailyChange}
          icon={
            <DailyIcon
              size={16}
              className={summary.totalDailyChange >= 0 ? "text-gain" : "text-loss"}
            />
          }
        />

        {/* P&G No Realizado */}
        <MetricCard
          title="P&G No realizado"
          value={formatCurrency(summary.totalUnrealizedPnL)}
          subValue={formatPercent(summary.totalUnrealizedPnLPct)}
          colorValue={summary.totalUnrealizedPnL}
          icon={
            <Activity
              size={16}
              className={summary.totalUnrealizedPnL >= 0 ? "text-gain" : "text-loss"}
            />
          }
        />

        {/* P&G Realizado */}
        <MetricCard
          title="P&G Realizado"
          value={formatCurrency(summary.totalRealizedPnL)}
          subLabel="posiciones cerradas"
          colorValue={summary.totalRealizedPnL}
          icon={
            <TrendingUp
              size={16}
              className={summary.totalRealizedPnL >= 0 ? "text-gain" : "text-loss"}
            />
          }
        />
      </div>

      {/* Disclaimer */}
      <p className="text-text-muted text-2xs mt-3">
        Precios con retraso de hasta 60s. No constituye asesoría financiera.
        Última actualización:{" "}
        {new Date(summary.lastUpdated).toLocaleTimeString("es-CO")}
      </p>
    </section>
  );
}
