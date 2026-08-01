// GET /api/portfolio

import { NextResponse } from "next/server";
import { fetchAllTransactions } from "@/lib/supabase/client";
import { requireUser } from "@/lib/supabase/server";
import { fetchQuotes, fetchCompanyProfiles, fetchEarningsCalendar } from "@/lib/finnhub/client";
import { fetchPostMarketQuotes, isPostMarketWindow } from "@/lib/yahoo/client";
import {
  calculateHoldingStates,
  calculateCashFlow,
  calculateNetCapitalInMarket,
  buildHoldings,
  buildPortfolioSummary,
  buildClosedPositions,
  attachEarnings,
  attachPostMarket,
} from "@/lib/finance/calculations";

// Los datos cambian con cada transacción — nunca servir una versión cacheada
export const dynamic = "force-dynamic";
export const revalidate = 0;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDaysISO(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const transactions = await fetchAllTransactions(supabase);

    if (transactions.length === 0) {
      return NextResponse.json({ holdings: [], summary: null, transactions: [], closedPositions: [] });
    }

    // Flujos de caja (DIVIDEND, DEPOSIT, FEE, etc.)
    const cashFlow = calculateCashFlow(transactions);
    const netCapitalInMarket = calculateNetCapitalInMarket(transactions);

    // Estados de holdings (solo BUY/SELL)
    const holdingStates = calculateHoldingStates(transactions);

    const activeTickers = Array.from(holdingStates.entries())
      .filter(([, s]) => s.sharesHeld > 0)
      .map(([ticker]) => ticker);

    const realizedMap = new Map(
      Array.from(holdingStates.entries()).map(([t, s]) => [t, s.realizedPnL])
    );

    if (activeTickers.length === 0) {
      const companyProfiles = await fetchCompanyProfiles(
        Array.from(holdingStates.keys())
      );
      return NextResponse.json({
        holdings: [],
        summary: buildPortfolioSummary([], realizedMap, cashFlow, netCapitalInMarket),
        transactions,
        closedPositions: buildClosedPositions(holdingStates, companyProfiles),
      });
    }

    const [quotes, companyProfiles, earningsByTicker] = await Promise.all([
      fetchQuotes(activeTickers),
      fetchCompanyProfiles(Array.from(new Set([...activeTickers, ...holdingStates.keys()]))),
      fetchEarningsCalendar(activeTickers, todayISO(), addDaysISO(120)).catch((err) => {
        console.error("[GET /api/portfolio] earnings calendar:", err);
        return new Map<string, { date: string; hour: string }>();
      }),
    ]);

    let holdings = buildHoldings(holdingStates, quotes, companyProfiles);
    holdings = attachEarnings(holdings, earningsByTicker);

    // El precio post-market solo tiene sentido (y solo se pide) dentro
    // de la ventana 4-8pm ET — fuera de ahí, las columnas ni se calculan.
    if (isPostMarketWindow()) {
      try {
        const postMarketByTicker = await fetchPostMarketQuotes(activeTickers);
        holdings = attachPostMarket(holdings, postMarketByTicker);
      } catch (err) {
        console.error("[GET /api/portfolio] post-market:", err);
      }
    }

    const summary = buildPortfolioSummary(holdings, realizedMap, cashFlow, netCapitalInMarket);
    const closedPositions = buildClosedPositions(holdingStates, companyProfiles);

    return NextResponse.json({ holdings, summary, transactions, closedPositions });
  } catch (error) {
    console.error("[GET /api/portfolio]", error);
    return NextResponse.json({ error: "Error calculando portafolio" }, { status: 500 });
  }
}
