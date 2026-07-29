// ─────────────────────────────────────────────────────────────
// CÁLCULOS FINANCIEROS
// Fórmulas documentadas en ./formulas.md
// ─────────────────────────────────────────────────────────────

import {
  Transaction,
  Holding,
  PortfolioSummary,
  CashFlowSummary,
  Quote,
  TRADING_TYPES,
} from "@/types";

interface HoldingState {
  ticker: string;
  sharesHeld: number;
  avgCost: number;
  realizedPnL: number;
}

// Por debajo de esto, un resultado de aritmética de punto flotante
// (ej. 1 + 0.64 - 0.64 - 1 = 1.11e-16) se trata como posición cerrada.
// Ningún broker reporta fracciones de acción tan pequeñas.
const SHARES_EPSILON = 1e-6;

// ─── Calcular estados de holdings (solo BUY/SELL) ─────────────

export function calculateHoldingStates(
  transactions: Transaction[]
): Map<string, HoldingState> {
  const sorted = [...transactions]
    .filter((tx) => TRADING_TYPES.includes(tx.type))
    .sort((a, b) => {
      const byDate = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (byDate !== 0) return byDate;
      // Mismo día: usar created_at para un orden determinista
      // (el resultado de sumas/restas en punto flotante depende del orden).
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

  const states = new Map<string, HoldingState>();

  for (const tx of sorted) {
    const ticker = tx.ticker.toUpperCase();
    if (!states.has(ticker)) {
      states.set(ticker, { ticker, sharesHeld: 0, avgCost: 0, realizedPnL: 0 });
    }

    const state = states.get(ticker)!;

    if (tx.type === "BUY") {
      const totalCost = state.sharesHeld * state.avgCost + tx.shares * tx.price + tx.fees;
      const totalShares = state.sharesHeld + tx.shares;
      state.avgCost = totalShares > 0 ? totalCost / totalShares : 0;
      state.sharesHeld = totalShares;
    } else if (tx.type === "SELL") {
      const realizedOnSale =
        (tx.price - state.avgCost) * Math.min(tx.shares, state.sharesHeld) - tx.fees;
      state.realizedPnL += realizedOnSale;
      const remaining = state.sharesHeld - tx.shares;
      state.sharesHeld = remaining < SHARES_EPSILON ? 0 : remaining;
      if (state.sharesHeld === 0) state.avgCost = 0;
    }
  }

  return states;
}

// ─── Capital neto en mercado (todo el historial, no solo lo abierto) ─

export function calculateNetCapitalInMarket(transactions: Transaction[]): number {
  let net = 0;
  for (const tx of transactions) {
    if (tx.type === "BUY") net += tx.shares * tx.price + tx.fees;
    else if (tx.type === "SELL") net -= tx.shares * tx.price - tx.fees;
  }
  return net;
}

// ─── Calcular flujos de caja (DIVIDEND, DEPOSIT, etc.) ───────

export function calculateCashFlow(transactions: Transaction[]): CashFlowSummary {
  let totalDeposits    = 0;
  let totalWithdrawals = 0;
  let totalDividends   = 0;
  let totalFees        = 0;
  let totalInterest    = 0;

  for (const tx of transactions) {
    const amount = tx.price; // para movimientos de efectivo, price = monto total
    switch (tx.type) {
      case "DEPOSIT":    totalDeposits    += amount; break;
      case "WITHDRAWAL": totalWithdrawals += amount; break;
      case "DIVIDEND":   totalDividends   += amount; break;
      case "FEE":        totalFees        += amount; break;
      case "INTEREST":   totalInterest    += amount; break;
    }
  }

  return {
    totalDeposits,
    totalWithdrawals,
    totalDividends,
    totalFees,
    totalInterest,
    netCashFlow:
      totalDeposits + totalDividends + totalInterest - totalWithdrawals - totalFees,
  };
}

// ─── Construir holdings con precios de mercado ───────────────

export function buildHoldings(
  states: Map<string, HoldingState>,
  quotes: Map<string, Quote>,
  companyProfiles: Map<string, { name: string; industry: string }>
): Holding[] {
  const partials: Omit<Holding, "weight">[] = [];
  let totalPortfolioValue = 0;

  for (const [ticker, state] of states.entries()) {
    if (state.sharesHeld <= 0) continue;
    const quote = quotes.get(ticker);
    if (!quote) continue;

    const currentValue     = state.sharesHeld * quote.currentPrice;
    const investedValue    = state.sharesHeld * state.avgCost;
    const unrealizedPnL    = currentValue - investedValue;
    const unrealizedPnLPct = investedValue !== 0 ? (unrealizedPnL / investedValue) * 100 : 0;
    const dailyChange      = (quote.currentPrice - quote.prevClose) * state.sharesHeld;
    const dailyChangePct   = quote.prevClose !== 0
      ? ((quote.currentPrice - quote.prevClose) / quote.prevClose) * 100
      : 0;
    const profile = companyProfiles.get(ticker);

    totalPortfolioValue += currentValue;
    partials.push({
      ticker,
      companyName: profile?.name ?? ticker,
      industry: profile?.industry || "Otros",
      shares: state.sharesHeld,
      avgCost: state.avgCost,
      currentPrice: quote.currentPrice,
      currentValue,
      investedValue,
      unrealizedPnL,
      unrealizedPnLPct,
      dailyChange,
      dailyChangePct,
      prevClose: quote.prevClose,
    });
  }

  return partials
    .map((p) => ({
      ...p,
      weight: totalPortfolioValue > 0 ? (p.currentValue / totalPortfolioValue) * 100 : 0,
    }))
    .sort((a, b) => b.currentValue - a.currentValue);
}

// ─── Resumen del portafolio ───────────────────────────────────

export function buildPortfolioSummary(
  holdings: Holding[],
  realizedPnLByTicker: Map<string, number>,
  cashFlow: CashFlowSummary,
  netCapitalInMarket: number
): PortfolioSummary {
  const totalValue         = holdings.reduce((s, h) => s + h.currentValue, 0);
  const totalInvested      = holdings.reduce((s, h) => s + h.investedValue, 0);
  const totalUnrealizedPnL = holdings.reduce((s, h) => s + h.unrealizedPnL, 0);
  const totalDailyChange   = holdings.reduce((s, h) => s + h.dailyChange, 0);
  const totalRealizedPnL   = Array.from(realizedPnLByTicker.values()).reduce((s, v) => s + v, 0);

  const totalUnrealizedPnLPct = totalInvested !== 0
    ? (totalUnrealizedPnL / totalInvested) * 100
    : 0;
  const prevTotalValue = totalValue - totalDailyChange;
  const totalDailyChangePct = prevTotalValue !== 0
    ? (totalDailyChange / prevTotalValue) * 100
    : 0;

  // Efectivo disponible: lo que entró/salió de la cuenta menos lo que
  // sigue puesto en el mercado a lo largo de toda la historia.
  const cashAvailable = cashFlow.netCashFlow - netCapitalInMarket;
  const totalNetWorth = totalValue + cashAvailable;
  const cashAvailablePct = totalNetWorth !== 0 ? (cashAvailable / totalNetWorth) * 100 : 0;

  // Rendimiento total desde el inicio, relativo al capital neto aportado
  // (depósitos - retiros). Es un % simple, no TWR/XIRR.
  const totalReturn =
    totalUnrealizedPnL + totalRealizedPnL + cashFlow.totalDividends + cashFlow.totalInterest - cashFlow.totalFees;
  const netContributed = cashFlow.totalDeposits - cashFlow.totalWithdrawals;
  const totalReturnPct = netContributed !== 0 ? (totalReturn / netContributed) * 100 : 0;

  return {
    totalValue,
    totalInvested,
    totalUnrealizedPnL,
    totalUnrealizedPnLPct,
    totalRealizedPnL,
    totalDailyChange,
    totalDailyChangePct,
    holdingsCount: holdings.length,
    cashFlow,
    cashAvailable,
    cashAvailablePct,
    totalReturn,
    totalReturnPct,
    lastUpdated: new Date().toISOString(),
  };
}

// ─── Distribución por sector (industria de Finnhub + efectivo) ────

export interface SectorAllocation {
  name: string;
  pct: number;
}

export function buildSectorAllocation(
  holdings: Holding[],
  cashAvailable: number
): SectorAllocation[] {
  const totalNetWorth = holdings.reduce((s, h) => s + h.currentValue, 0) + cashAvailable;
  if (totalNetWorth <= 0) return [];

  const byIndustry = new Map<string, number>();
  for (const h of holdings) {
    byIndustry.set(h.industry, (byIndustry.get(h.industry) ?? 0) + h.currentValue);
  }

  const allocation = Array.from(byIndustry.entries()).map(([name, value]) => ({
    name,
    pct: (value / totalNetWorth) * 100,
  }));

  if (cashAvailable > 0) {
    allocation.push({ name: "Efectivo", pct: (cashAvailable / totalNetWorth) * 100 });
  }

  return allocation.sort((a, b) => b.pct - a.pct);
}

// ─── Helpers de formato ──────────────────────────────────────

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number, decimals = 2): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatShares(shares: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(shares);
}

export function pnlColorClass(value: number): string {
  if (value > 0) return "text-gain";
  if (value < 0) return "text-loss";
  return "text-text-secondary";
}