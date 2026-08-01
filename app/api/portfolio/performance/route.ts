// GET /api/portfolio/performance?range=MTD|1M|3M|6M|1Y|YTD|ALL&benchmarks=NASDAQ,SP500,...

import { NextRequest, NextResponse } from "next/server";
import { fetchAllTransactions } from "@/lib/supabase/client";
import { requireUser } from "@/lib/supabase/server";
import { fetchDailyClosesForTickers, fetchDailyCloses, fetchLiveQuote } from "@/lib/yahoo/client";
import { getEarliestTransactionDate } from "@/lib/finance/calculations";
import {
  resolveDateRange,
  getRelevantTickers,
  buildDailySeries,
  buildTWRCurve,
  calculateModifiedDietz,
  normalizeToPercentSeries,
  appendOrReplaceToday,
  BENCHMARK_SYMBOLS,
  type PerformanceRange,
  type BenchmarkKey,
  type PercentPoint,
} from "@/lib/finance/performance";

export const dynamic = "force-dynamic";

const VALID_RANGES: PerformanceRange[] = ["MTD", "1M", "3M", "6M", "1Y", "YTD", "ALL"];
const VALID_BENCHMARKS = Object.keys(BENCHMARK_SYMBOLS) as BenchmarkKey[];

async function fetchBenchmarkPctSeries(
  key: BenchmarkKey,
  fromUnix: number,
  toUnix: number
): Promise<PercentPoint[]> {
  const symbol = BENCHMARK_SYMBOLS[key];
  const closes = await fetchDailyCloses(symbol, fromUnix, toUnix);
  let series = closes.map((c) => ({ date: c.date, value: c.close }));

  // El histórico diario puede quedarse "hasta ayer" durante la sesión de
  // hoy — se completa con la cotización en vivo si está más fresca.
  try {
    const live = await fetchLiveQuote(symbol);
    series = appendOrReplaceToday(series, live.date, live.price);
  } catch (err) {
    console.error(`[performance] cotización en vivo de ${key}:`, err);
  }

  return normalizeToPercentSeries(series);
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const rangeParam = searchParams.get("range") ?? "1M";
    const benchmarksParam = searchParams.get("benchmarks");
    const benchmarks = benchmarksParam
      ? (benchmarksParam.split(",").filter(Boolean) as BenchmarkKey[])
      : [];

    if (!VALID_RANGES.includes(rangeParam as PerformanceRange)) {
      return NextResponse.json(
        { error: `range inválido. Valores permitidos: ${VALID_RANGES.join(", ")}` },
        { status: 400 }
      );
    }
    const invalidBenchmark = benchmarks.find((b) => !VALID_BENCHMARKS.includes(b));
    if (invalidBenchmark) {
      return NextResponse.json(
        { error: `benchmark inválido: "${invalidBenchmark}". Valores permitidos: ${VALID_BENCHMARKS.join(", ")}` },
        { status: 400 }
      );
    }
    const range = rangeParam as PerformanceRange;

    // "ALL" necesita la fecha de la primera transacción — hay que traer
    // las transacciones ANTES de poder resolver el rango de fechas.
    const transactions = await fetchAllTransactions(supabase);
    const earliestDate = getEarliestTransactionDate(transactions) ?? undefined;
    const { start, end } = resolveDateRange(range, new Date(), earliestDate);
    const fromUnix = Math.floor(new Date(`${start}T00:00:00Z`).getTime() / 1000);
    const toUnix = Math.floor(new Date(`${end}T00:00:00Z`).getTime() / 1000) + 86_400; // +1 día: rango medio-abierto en Yahoo

    // Los benchmarks no dependen de tener transacciones — se pueden pedir solos.
    const benchmarkSeriesPromise = Promise.all(
      benchmarks.map(async (key) => {
        try {
          return [key, await fetchBenchmarkPctSeries(key, fromUnix, toUnix)] as const;
        } catch (err) {
          console.error(`[performance] benchmark ${key}:`, err);
          return [key, []] as const;
        }
      })
    ).then((entries) => Object.fromEntries(entries) as Record<BenchmarkKey, PercentPoint[]>);

    if (transactions.length === 0) {
      return NextResponse.json({
        range, series: [], twrCurve: [], twr: 0, mwr: 0, startValue: 0, endValue: 0,
        benchmarks, benchmarkSeries: await benchmarkSeriesPromise,
      });
    }

    const tickers = getRelevantTickers(transactions, start, end);
    if (tickers.length === 0) {
      return NextResponse.json({
        range, series: [], twrCurve: [], twr: 0, mwr: 0, startValue: 0, endValue: 0,
        benchmarks, benchmarkSeries: await benchmarkSeriesPromise,
      });
    }

    const [closesByTicker, benchmarkSeries] = await Promise.all([
      fetchDailyClosesForTickers(tickers, fromUnix, toUnix),
      benchmarkSeriesPromise,
    ]);

    const { series, flows } = buildDailySeries(transactions, closesByTicker, start, end);
    const twrCurve = buildTWRCurve(series, flows);
    const twr = twrCurve.length > 0 ? twrCurve[twrCurve.length - 1].pct : 0;
    const mwr = calculateModifiedDietz(series, flows);

    return NextResponse.json({
      range,
      series,
      twrCurve,
      twr,
      mwr,
      startValue: series[0]?.value ?? 0,
      endValue: series[series.length - 1]?.value ?? 0,
      benchmarks,
      benchmarkSeries,
    });
  } catch (error) {
    console.error("[GET /api/portfolio/performance]", error);
    return NextResponse.json({ error: "Error calculando rendimiento histórico" }, { status: 500 });
  }
}
