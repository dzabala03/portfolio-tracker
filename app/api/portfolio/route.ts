// GET /api/portfolio

import { NextResponse } from "next/server";
import { fetchAllTransactions } from "@/lib/supabase/client";
import { fetchQuotes, fetchCompanyNames } from "@/lib/finnhub/client";
import {
  calculateHoldingStates,
  calculateCashFlow,
  buildHoldings,
  buildPortfolioSummary,
} from "@/lib/finance/calculations";
import { TRADING_TYPES } from "@/types";

// Los datos cambian con cada transacción — nunca servir una versión cacheada
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const transactions = await fetchAllTransactions();

    if (transactions.length === 0) {
      return NextResponse.json({ holdings: [], summary: null, transactions: [] });
    }

    // Flujos de caja (DIVIDEND, DEPOSIT, FEE, etc.)
    const cashFlow = calculateCashFlow(transactions);

    // Estados de holdings (solo BUY/SELL)
    const holdingStates = calculateHoldingStates(transactions);

    const activeTickers = Array.from(holdingStates.entries())
      .filter(([, s]) => s.sharesHeld > 0)
      .map(([ticker]) => ticker);

    if (activeTickers.length === 0) {
      const realizedMap = new Map(
        Array.from(holdingStates.entries()).map(([t, s]) => [t, s.realizedPnL])
      );
      return NextResponse.json({
        holdings: [],
        summary: buildPortfolioSummary([], realizedMap, cashFlow),
        transactions,
      });
    }

    const [quotes, companyNames] = await Promise.all([
      fetchQuotes(activeTickers),
      fetchCompanyNames(activeTickers),
    ]);

    const holdings = buildHoldings(holdingStates, quotes, companyNames);
    const realizedMap = new Map(
      Array.from(holdingStates.entries()).map(([t, s]) => [t, s.realizedPnL])
    );
    const summary = buildPortfolioSummary(holdings, realizedMap, cashFlow);

    return NextResponse.json({ holdings, summary, transactions });
  } catch (error) {
    console.error("[GET /api/portfolio]", error);
    return NextResponse.json({ error: "Error calculando portafolio" }, { status: 500 });
  }
}