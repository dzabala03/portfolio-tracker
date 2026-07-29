// GET /api/portfolio/performance?range=MTD|1M|6M|1Y|YTD

import { NextRequest, NextResponse } from "next/server";
import { fetchAllTransactions } from "@/lib/supabase/client";
import { fetchDailyClosesForTickers } from "@/lib/yahoo/client";
import {
  resolveDateRange,
  getRelevantTickers,
  buildDailySeries,
  calculateTWR,
  calculateModifiedDietz,
  type PerformanceRange,
} from "@/lib/finance/performance";

export const dynamic = "force-dynamic";

const VALID_RANGES: PerformanceRange[] = ["MTD", "1M", "6M", "1Y", "YTD"];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rangeParam = searchParams.get("range") ?? "1M";

    if (!VALID_RANGES.includes(rangeParam as PerformanceRange)) {
      return NextResponse.json(
        { error: `range inválido. Valores permitidos: ${VALID_RANGES.join(", ")}` },
        { status: 400 }
      );
    }
    const range = rangeParam as PerformanceRange;

    const transactions = await fetchAllTransactions();
    if (transactions.length === 0) {
      return NextResponse.json({ range, series: [], twr: 0, mwr: 0, startValue: 0, endValue: 0 });
    }

    const { start, end } = resolveDateRange(range);
    const tickers = getRelevantTickers(transactions, start, end);

    if (tickers.length === 0) {
      return NextResponse.json({ range, series: [], twr: 0, mwr: 0, startValue: 0, endValue: 0 });
    }

    // +1 día en period2: el rango de Yahoo es medio-abierto y así nos
    // asegura incluir la vela del propio `end`.
    const fromUnix = Math.floor(new Date(`${start}T00:00:00Z`).getTime() / 1000);
    const toUnix = Math.floor(new Date(`${end}T00:00:00Z`).getTime() / 1000) + 86_400;

    const closesByTicker = await fetchDailyClosesForTickers(tickers, fromUnix, toUnix);
    const { series, flows } = buildDailySeries(transactions, closesByTicker, start, end);

    const twr = calculateTWR(series, flows);
    const mwr = calculateModifiedDietz(series, flows);

    return NextResponse.json({
      range,
      series,
      twr,
      mwr,
      startValue: series[0]?.value ?? 0,
      endValue: series[series.length - 1]?.value ?? 0,
    });
  } catch (error) {
    console.error("[GET /api/portfolio/performance]", error);
    return NextResponse.json({ error: "Error calculando rendimiento histórico" }, { status: 500 });
  }
}
