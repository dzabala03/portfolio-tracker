"use client";

import type { PortfolioSummary } from "@/types";
import { formatCurrency, formatPercent } from "@/lib/finance/calculations";
import { clsx } from "clsx";

interface Props {
  summary: PortfolioSummary;
}

function DeltaArrow({ up }: { up: boolean }) {
  return up ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="var(--color-gain)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15l6-6 4 4 6-8"></path>
      <path d="M14 5h6v6"></path>
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="var(--color-loss)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9l6 6 4-4 6 8"></path>
      <path d="M14 19h6v-6"></path>
    </svg>
  );
}

export function PortfolioSummaryCards({ summary }: Props) {
  const dailyUp = summary.totalDailyChange >= 0;
  const returnUp = summary.totalReturn >= 0;
  const hasPostMarket = summary.postMarketChange !== null;
  const postMarketUp = (summary.postMarketChange ?? 0) >= 0;

  return (
    <div className="summary">
      {/* Total depositado */}
      <div>
        <div className="kicker">Total depositado</div>
        <div className="big-num" style={{ fontSize: 30 }}>
          {formatCurrency(summary.cashFlow.totalDeposits)}
        </div>
        <div className="delta delta-muted">capital aportado en USD</div>
      </div>

      {/* Valor total del portafolio */}
      <div>
        <div className="kicker">Valor total del portafolio</div>
        <div className="big-num">{formatCurrency(summary.totalValue)}</div>
        <div className={clsx("delta", dailyUp ? "up" : "down")}>
          <DeltaArrow up={dailyUp} />
          {dailyUp ? "+" : ""}
          {formatCurrency(summary.totalDailyChange)} ({formatPercent(summary.totalDailyChangePct)}) hoy
        </div>
        {hasPostMarket && (
          <div className={clsx("delta", "post-market-delta", postMarketUp ? "up" : "down")}>
            <DeltaArrow up={postMarketUp} />
            {postMarketUp ? "+" : ""}
            {formatCurrency(summary.postMarketChange!)} ({formatPercent(summary.postMarketChangePct!)}) pos-market
          </div>
        )}
      </div>

      {/* Rendimiento total */}
      <div>
        <div className="kicker">Rendimiento total</div>
        <div className="big-num" style={{ fontSize: 30 }}>
          {returnUp ? "+" : ""}
          {formatCurrency(summary.totalReturn)}
        </div>
        <div className={clsx("delta", returnUp ? "up" : "down")}>
          {formatPercent(summary.totalReturnPct)} desde el inicio
        </div>
      </div>

      {/* Efectivo disponible */}
      <div>
        <div className="kicker">Efectivo disponible</div>
        <div className="big-num" style={{ fontSize: 30 }}>
          {formatCurrency(summary.cashAvailable)}
        </div>
        <div className="delta delta-muted">
          {summary.cashAvailablePct.toFixed(1)}% del portafolio
        </div>
      </div>
    </div>
  );
}
