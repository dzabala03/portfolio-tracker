// GET /api/portfolio/asset-performance?range=1W|MTD|1M|3M|6M|1Y|YTD|ALL
//
// Variación por posición ABIERTA en el rango elegido — alimenta
// "Mejor/Peor activo" en el panel de Distribución.

import { NextRequest, NextResponse } from "next/server";
import { fetchAllTransactions } from "@/lib/supabase/client";
import { requireUser } from "@/lib/supabase/server";
import { fetchQuotes } from "@/lib/finnhub/client";
import { fetchDailyClosesForTickers } from "@/lib/yahoo/client";
import {
  calculateHoldingStates,
  findClosestPriorClose,
  getEarliestTransactionDate,
  getCurrentHoldingStartDates,
} from "@/lib/finance/calculations";
import { resolveDateRange, type PerformanceRange } from "@/lib/finance/performance";

export const dynamic = "force-dynamic";

const VALID_RANGES: PerformanceRange[] = ["1W", "MTD", "1M", "3M", "6M", "1Y", "YTD", "ALL"];

export interface AssetChange {
  ticker: string;
  changePct: number;
  changeValue: number;
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const rangeParam = searchParams.get("range") ?? "1M";
    if (!VALID_RANGES.includes(rangeParam as PerformanceRange)) {
      return NextResponse.json(
        { error: `range inválido. Valores permitidos: ${VALID_RANGES.join(", ")}` },
        { status: 400 }
      );
    }
    const range = rangeParam as PerformanceRange;

    const transactions = await fetchAllTransactions(supabase);
    const holdingStates = calculateHoldingStates(transactions);
    const activeTickers = Array.from(holdingStates.entries())
      .filter(([, s]) => s.sharesHeld > 0)
      .map(([ticker]) => ticker);

    if (activeTickers.length === 0) {
      return NextResponse.json({ range, assets: [] });
    }

    const earliestDate = getEarliestTransactionDate(transactions) ?? undefined;
    const { start, end } = resolveDateRange(range, new Date(), earliestDate);

    // Si compraste el ticker DESPUÉS del inicio del rango (ej. "All"
    // pero lo compraste hace 2 meses), comparar contra el precio de
    // antes de tenerlo no tiene sentido — se usa lo que sea más tarde
    // entre el inicio del rango y el inicio de tu tenencia actual.
    const holdingStartByTicker = getCurrentHoldingStartDates(transactions);

    const targetUnix = Math.floor(new Date(`${start}T00:00:00Z`).getTime() / 1000);
    const fromUnix = targetUnix - 86_400 * 6;
    const toUnix = Math.floor(new Date(`${end}T00:00:00Z`).getTime() / 1000) + 86_400;

    const [quotes, closesByTicker] = await Promise.all([
      fetchQuotes(activeTickers),
      fetchDailyClosesForTickers(activeTickers, fromUnix, toUnix),
    ]);

    const assets: AssetChange[] = [];
    for (const ticker of activeTickers) {
      const quote = quotes.get(ticker);
      const closes = closesByTicker.get(ticker);
      if (!quote || !closes) continue;

      const holdingStart = holdingStartByTicker.get(ticker);
      const effectiveStart = holdingStart && holdingStart > start ? holdingStart : start;

      const priceThen = findClosestPriorClose(closes, effectiveStart);
      if (priceThen === null || priceThen === 0) continue;

      const shares = holdingStates.get(ticker)!.sharesHeld;
      assets.push({
        ticker,
        changePct: ((quote.currentPrice - priceThen) / priceThen) * 100,
        changeValue: (quote.currentPrice - priceThen) * shares,
      });
    }

    return NextResponse.json({ range, assets });
  } catch (error) {
    console.error("[GET /api/portfolio/asset-performance]", error);
    return NextResponse.json({ error: "Error calculando variación por activo" }, { status: 500 });
  }
}
