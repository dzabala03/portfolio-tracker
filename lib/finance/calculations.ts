// ─────────────────────────────────────────────────────────────
// CÁLCULOS FINANCIEROS
// Fórmulas documentadas en ./formulas.md
// ─────────────────────────────────────────────────────────────

import {
  Transaction,
  Holding,
  ClosedPosition,
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

// ─── Fecha de la primera transacción (para el rango "All") ──

export function getEarliestTransactionDate(transactions: Transaction[]): string | null {
  if (transactions.length === 0) return null;
  return transactions.reduce((min, tx) => (tx.date < min ? tx.date : min), transactions[0].date);
}

// ─── Fecha de inicio de la racha de tenencia ACTUAL por ticker ───
//
// Para "variación en el rango" de un ticker: si compraste NOW por
// primera vez en abril, comparar su precio contra el inicio del rango
// "All" (dic-2024, antes de que lo tuvieras) da una cifra sin sentido
// — se detectó así: "peor activo (ALL)" mostraba NOW en -50% cuando en
// realidad viene ganando desde que lo tienes. Esta función devuelve,
// por ticker, la fecha del último cruce de 0 a >0 acciones (el inicio
// de la racha de tenencia vigente, no la primera compra de toda la
// vida si hubo un cierre completo en el medio).

export function getCurrentHoldingStartDates(transactions: Transaction[]): Map<string, string> {
  const sorted = [...transactions]
    .filter((tx) => TRADING_TYPES.includes(tx.type))
    .sort((a, b) => {
      const byDate = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (byDate !== 0) return byDate;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

  const sharesHeld = new Map<string, number>();
  const startDates = new Map<string, string>();

  for (const tx of sorted) {
    const ticker = tx.ticker.toUpperCase();
    const prevShares = sharesHeld.get(ticker) ?? 0;

    if (prevShares <= SHARES_EPSILON && tx.type === "BUY") {
      startDates.set(ticker, tx.date); // arranca (o reinicia) la racha
    }

    const delta = tx.type === "BUY" ? tx.shares : -tx.shares;
    const newShares = Math.max(0, prevShares + delta);
    sharesHeld.set(ticker, newShares < SHARES_EPSILON ? 0 : newShares);
  }

  return startDates;
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
      realizedPnL: state.realizedPnL,
      totalPnL: unrealizedPnL + state.realizedPnL,
      dailyChange,
      dailyChangePct,
      prevClose: quote.prevClose,
      // Se completan después con lib/yahoo y lib/finnhub (necesitan
      // llamadas aparte); null por defecto si no aplica/no hay dato.
      nextEarningsDate: null,
      earningsTiming: null,
      postMarketPrice: null,
      postMarketChange: null,
      postMarketChangePct: null,
    });
  }

  return partials
    .map((p) => ({
      ...p,
      weight: totalPortfolioValue > 0 ? (p.currentValue / totalPortfolioValue) * 100 : 0,
    }))
    .sort((a, b) => b.currentValue - a.currentValue);
}

// ─── Earnings y post-market — se adjuntan a los holdings ya armados ──

export function attachEarnings(
  holdings: Holding[],
  earningsByTicker: Map<string, { date: string; hour: string }>
): Holding[] {
  return holdings.map((h) => {
    const entry = earningsByTicker.get(h.ticker);
    if (!entry) return h;
    return { ...h, nextEarningsDate: entry.date, earningsTiming: entry.hour as Holding["earningsTiming"] };
  });
}

export function attachPostMarket(
  holdings: Holding[],
  postMarketByTicker: Map<string, { price: number; change: number; changePct: number }>
): Holding[] {
  return holdings.map((h) => {
    const pm = postMarketByTicker.get(h.ticker);
    if (!pm) return h;
    return { ...h, postMarketPrice: pm.price, postMarketChange: pm.change, postMarketChangePct: pm.changePct };
  });
}

// ─── Posiciones cerradas (ticker ya no se tiene, pero se operó) ──

export function buildClosedPositions(
  states: Map<string, { ticker: string; sharesHeld: number; realizedPnL: number }>,
  companyProfiles: Map<string, { name: string; industry: string }>
): ClosedPosition[] {
  const closed: ClosedPosition[] = [];
  for (const [ticker, state] of states.entries()) {
    if (state.sharesHeld > 0) continue; // sigue abierta, no va aquí
    if (state.realizedPnL === 0) continue; // nunca se operó de verdad (no debería pasar, pero por si acaso)
    const profile = companyProfiles.get(ticker);
    closed.push({
      ticker,
      companyName: profile?.name ?? ticker,
      industry: profile?.industry || "Otros",
      realizedPnL: state.realizedPnL,
    });
  }
  return closed.sort((a, b) => b.realizedPnL - a.realizedPnL);
}

// ─── Variación a 30 días por posición (usa histórico de Yahoo) ───

// Busca, entre los cierres disponibles, el más cercano EN O ANTES de
// targetDate; si no hay ninguno anterior (ticker muy nuevo), cae al
// primer cierre disponible.
export function findClosestPriorClose(closes: Map<string, number>, targetDate: string): number | null {
  if (closes.size === 0) return null;
  const dates = Array.from(closes.keys()).sort();
  let best: string | null = null;
  for (const d of dates) {
    if (d <= targetDate) best = d;
    else break;
  }
  const chosen = best ?? dates[0];
  return closes.get(chosen) ?? null;
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

  // Post-market agregado — null si no estamos en la ventana 4-8pm ET
  // (o si Yahoo no tenía dato todavía para ninguna posición).
  const withPostMarket = holdings.filter((h) => h.postMarketChange !== null);
  const postMarketChange = withPostMarket.length > 0
    ? withPostMarket.reduce((s, h) => s + h.postMarketChange! * h.shares, 0)
    : null;
  const postMarketChangePct = postMarketChange !== null && totalValue !== 0
    ? (postMarketChange / totalValue) * 100
    : null;

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
    postMarketChange,
    postMarketChangePct,
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