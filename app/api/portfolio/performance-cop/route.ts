// GET /api/portfolio/performance-cop?range=MTD|1M|3M|6M|1Y|YTD|ALL
//
// Evolución del portafolio en pesos — dos modos (igual que el gráfico
// en USD) y dentro de cada uno, dos líneas "sin/con efecto TRM":
//
//  - "valueSeries" (modo Valor): el valor en USD de cada día × la TRM
//    — sin efecto usa la TRM de HOY (constante); con efecto usa la TRM
//    REAL de ese día.
//  - "twrSinEfecto"/"twrConEfecto" (modo % de rendimiento): el TWR
//    encadenado día a día. "Sin efecto" es matemáticamente idéntico al
//    TWR en USD (escalar por una constante no cambia ningún %); "con
//    efecto" se recalcula convirtiendo cada día del valor y cada flujo
//    de caja a pesos con la TRM real de esa fecha, para que el
//    movimiento de la TRM día a día quede reflejado en el % de retorno.

import { NextRequest, NextResponse } from "next/server";
import { fetchAllTransactions } from "@/lib/supabase/client";
import { requireUser } from "@/lib/supabase/server";
import { fetchDailyClosesForTickers } from "@/lib/yahoo/client";
import { getEarliestTransactionDate } from "@/lib/finance/calculations";
import { fetchTRM, fetchTRMSeries } from "@/lib/trm/client";
import {
  resolveDateRange,
  getRelevantTickers,
  buildDailySeries,
  buildTWRCurve,
  type PerformanceRange,
} from "@/lib/finance/performance";

export const dynamic = "force-dynamic";

const VALID_RANGES: PerformanceRange[] = ["MTD", "1M", "3M", "6M", "1Y", "YTD", "ALL"];
const EMPTY_RESPONSE = { valueSeries: [], twrSinEfecto: [], twrConEfecto: [] };

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
    if (transactions.length === 0) {
      return NextResponse.json({ range, ...EMPTY_RESPONSE });
    }

    const earliestDate = getEarliestTransactionDate(transactions) ?? undefined;
    const { start, end } = resolveDateRange(range, new Date(), earliestDate);

    const tickers = getRelevantTickers(transactions, start, end);
    if (tickers.length === 0) {
      return NextResponse.json({ range, ...EMPTY_RESPONSE });
    }

    const fromUnix = Math.floor(new Date(`${start}T00:00:00Z`).getTime() / 1000);
    const toUnix = Math.floor(new Date(`${end}T00:00:00Z`).getTime() / 1000) + 86_400; // +1 día: rango medio-abierto en Yahoo

    const [closesByTicker, trmSeries, trmHoy] = await Promise.all([
      fetchDailyClosesForTickers(tickers, fromUnix, toUnix),
      fetchTRMSeries(start, end),
      fetchTRM(),
    ]);

    const { series, flows } = buildDailySeries(transactions, closesByTicker, start, end);

    // Un solo forward-fill sobre la UNIÓN de fechas de series+flows —
    // hacerlo por separado en dos .map() distintos arrastraría el
    // "último TRM conocido" de uno al otro y podría contaminar el
    // resultado si sus fechas no coinciden exactamente.
    const allDates = Array.from(new Set([...series.map((p) => p.date), ...flows.map((f) => f.date)])).sort();
    const trmByDate = new Map(trmSeries.map((p) => [p.date, p.value]));
    let lastKnownTrm = trmSeries[0]?.value ?? trmHoy.value;
    const trmLookup = new Map<string, number>();
    for (const date of allDates) {
      const v = trmByDate.get(date);
      if (v !== undefined) lastKnownTrm = v;
      trmLookup.set(date, lastKnownTrm);
    }

    // ─── Modo Valor: valor total del portafolio en pesos, día a día ──
    const valueSeries = series.map((p) => ({
      date: p.date,
      sinEfecto: p.value * trmHoy.value,
      conEfecto: p.value * (trmLookup.get(p.date) ?? trmHoy.value),
    }));

    // ─── Modo % de rendimiento: TWR encadenado día a día ─────────────
    const twrSinEfecto = buildTWRCurve(series, flows);

    const seriesCop = series.map((p) => ({ date: p.date, value: p.value * (trmLookup.get(p.date) ?? 0) }));
    const flowsCop = flows.map((f) => ({ date: f.date, amount: f.amount * (trmLookup.get(f.date) ?? 0) }));
    const twrConEfecto = buildTWRCurve(seriesCop, flowsCop);

    return NextResponse.json({ range, valueSeries, twrSinEfecto, twrConEfecto });
  } catch (error) {
    console.error("[GET /api/portfolio/performance-cop]", error);
    return NextResponse.json({ error: "Error calculando rendimiento en pesos" }, { status: 500 });
  }
}
