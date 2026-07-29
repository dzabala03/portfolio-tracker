// ─────────────────────────────────────────────────────────────
// RENDIMIENTO HISTÓRICO — TWR y MWR
// Fórmulas documentadas en ./formulas.md (secciones 14-16)
// ─────────────────────────────────────────────────────────────

import type { Transaction } from "@/types";
import { TRADING_TYPES } from "@/types";

export type PerformanceRange = "MTD" | "1M" | "6M" | "1Y" | "YTD";

export interface DailyValue {
  date: string; // "YYYY-MM-DD"
  value: number;
}

export interface CashFlowEvent {
  date: string;
  amount: number; // + depósito, − retiro
}

// ─── Resolución de rango de fechas ────────────────────────────

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function resolveDateRange(
  range: PerformanceRange,
  today: Date = new Date()
): { start: string; end: string } {
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const start = new Date(end);

  switch (range) {
    case "MTD":
      start.setUTCDate(1);
      break;
    case "1M":
      start.setUTCMonth(start.getUTCMonth() - 1);
      break;
    case "6M":
      start.setUTCMonth(start.getUTCMonth() - 6);
      break;
    case "1Y":
      start.setUTCFullYear(start.getUTCFullYear() - 1);
      break;
    case "YTD":
      start.setUTCMonth(0, 1);
      break;
  }

  return { start: toISO(start), end: toISO(end) };
}

// ─── Tickers relevantes para un rango (evita pedirle a Yahoo lo que no aporta) ──

export function getRelevantTickers(
  transactions: Transaction[],
  rangeStart: string,
  rangeEnd: string
): string[] {
  const trades = [...transactions]
    .filter((tx) => TRADING_TYPES.includes(tx.type))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const sharesAtStart = new Map<string, number>();
  const relevant = new Set<string>();

  for (const tx of trades) {
    const ticker = tx.ticker.toUpperCase();
    if (tx.date < rangeStart) {
      const prev = sharesAtStart.get(ticker) ?? 0;
      sharesAtStart.set(ticker, prev + (tx.type === "BUY" ? tx.shares : -tx.shares));
    } else if (tx.date <= rangeEnd) {
      relevant.add(ticker);
    }
  }

  for (const [ticker, shares] of sharesAtStart.entries()) {
    if (shares > 1e-9) relevant.add(ticker);
  }

  return Array.from(relevant);
}

// ─── Reconstrucción de la serie diaria de valor del portafolio ──

export function buildDailySeries(
  transactions: Transaction[],
  closesByTicker: Map<string, Map<string, number>>,
  rangeStart: string,
  rangeEnd: string
): { series: DailyValue[]; flows: CashFlowEvent[] } {
  const sorted = [...transactions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // Calendario de trading = unión de fechas que Yahoo devolvió para cualquier ticker.
  const tradingDatesSet = new Set<string>();
  for (const closes of closesByTicker.values()) {
    for (const date of closes.keys()) {
      if (date >= rangeStart && date <= rangeEnd) tradingDatesSet.add(date);
    }
  }
  const tradingDates = Array.from(tradingDatesSet).sort();
  if (tradingDates.length === 0) return { series: [], flows: [] };

  const shares = new Map<string, number>();
  const lastKnownClose = new Map<string, number>();
  let cash = 0;
  let txIdx = 0;
  const flows: CashFlowEvent[] = [];
  const series: DailyValue[] = [];

  for (const date of tradingDates) {
    // Aplicar todas las transacciones hasta esta fecha (inclusive) —
    // incluye las anteriores al rango, para llegar con el estado correcto.
    while (txIdx < sorted.length && sorted[txIdx].date <= date) {
      const tx = sorted[txIdx];
      const ticker = tx.ticker.toUpperCase();
      switch (tx.type) {
        case "BUY":
          shares.set(ticker, (shares.get(ticker) ?? 0) + tx.shares);
          cash -= tx.shares * tx.price + tx.fees;
          break;
        case "SELL":
          shares.set(ticker, (shares.get(ticker) ?? 0) - tx.shares);
          cash += tx.shares * tx.price - tx.fees;
          break;
        case "DEPOSIT":
          cash += tx.price;
          if (tx.date >= rangeStart) flows.push({ date: tx.date, amount: tx.price });
          break;
        case "WITHDRAWAL":
          cash -= tx.price;
          if (tx.date >= rangeStart) flows.push({ date: tx.date, amount: -tx.price });
          break;
        case "DIVIDEND":
        case "INTEREST":
          cash += tx.price; // ingreso de la inversión, no aporte externo — no cuenta para TWR/MWR
          break;
        case "FEE":
          cash -= tx.price;
          break;
      }
      txIdx++;
    }

    let value = cash;
    for (const [ticker, qty] of shares.entries()) {
      const todayClose = closesByTicker.get(ticker)?.get(date);
      if (todayClose !== undefined) lastKnownClose.set(ticker, todayClose);
      if (qty <= 1e-9) continue;
      const close = todayClose ?? lastKnownClose.get(ticker);
      if (close !== undefined) value += qty * close;
      // Si aún no hay ningún precio conocido para el ticker (recién comprado,
      // sin dato ese día todavía), se omite su aporte ese día puntual.
    }
    series.push({ date, value });
  }

  return { series, flows };
}

// ─── TWR — Time-Weighted Return (chain-linking diario) ────────

export function calculateTWR(series: DailyValue[], flows: CashFlowEvent[]): number {
  if (series.length < 2) return 0;

  const flowByDate = new Map<string, number>();
  for (const f of flows) flowByDate.set(f.date, (flowByDate.get(f.date) ?? 0) + f.amount);

  let growth = 1;
  for (let i = 1; i < series.length; i++) {
    const prevValue = series[i - 1].value;
    const todayValue = series[i].value;
    const todayFlow = flowByDate.get(series[i].date) ?? 0;
    // El aporte de hoy se trata como puesto al INICIO del día (antes del
    // movimiento de mercado), convención estándar cuando no se tiene el
    // valor intradía exacto en el momento del flujo.
    const base = prevValue + todayFlow;
    if (base > 0) growth *= todayValue / base;
  }

  return (growth - 1) * 100;
}

// ─── MWR — Money-Weighted Return (Modified Dietz) ─────────────
//
// Aproximación estándar (GIPS/CFA) del rendimiento ponderado por dinero
// sin necesidad de resolver una TIR iterativa. Penaliza aportes mal
// cronometrados: un depósito grande justo antes de una caída pesa poco
// en el denominador (queda "invertido" pocos días), así que esa caída
// golpea con fuerza el retorno relativo a su propio capital.

export function calculateModifiedDietz(series: DailyValue[], flows: CashFlowEvent[]): number {
  if (series.length < 2) return 0;

  const startValue = series[0].value;
  const endValue = series[series.length - 1].value;
  const startDate = new Date(series[0].date).getTime();
  const endDate = new Date(series[series.length - 1].date).getTime();
  const totalDays = Math.max(1, (endDate - startDate) / 86_400_000);

  let flowSum = 0;
  let weightedFlowSum = 0;
  for (const f of flows) {
    const flowDate = new Date(f.date).getTime();
    const daysRemaining = Math.max(0, (endDate - flowDate) / 86_400_000);
    const weight = daysRemaining / totalDays;
    flowSum += f.amount;
    weightedFlowSum += f.amount * weight;
  }

  const denominator = startValue + weightedFlowSum;
  if (denominator === 0) return 0;

  return ((endValue - startValue - flowSum) / denominator) * 100;
}
