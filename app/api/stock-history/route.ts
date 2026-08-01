// GET /api/stock-history?ticker=AAPL&range=MTD|1M|3M|6M|1Y|YTD|ALL
// Histórico de precios para el mini-gráfico de la ficha de detalle del
// buscador — separado de /api/stock-detail para no re-pedir perfil,
// estados financieros y noticias solo porque el usuario cambió el rango.

import { NextRequest, NextResponse } from "next/server";
import { fetchDailyCloses } from "@/lib/yahoo/client";
import { resolveDateRange, type PerformanceRange } from "@/lib/finance/performance";

export const dynamic = "force-dynamic";

const VALID_RANGES: PerformanceRange[] = ["MTD", "1M", "3M", "6M", "1Y", "YTD", "ALL"];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker")?.trim().toUpperCase();
  const rangeParam = searchParams.get("range") ?? "1Y";

  if (!ticker) {
    return NextResponse.json({ error: "Parámetro 'ticker' requerido" }, { status: 400 });
  }
  if (!VALID_RANGES.includes(rangeParam as PerformanceRange)) {
    return NextResponse.json(
      { error: `range inválido. Valores permitidos: ${VALID_RANGES.join(", ")}` },
      { status: 400 }
    );
  }
  const range = rangeParam as PerformanceRange;

  try {
    // No hay "fecha de la primera transacción" para un ticker cualquiera
    // buscado — "ALL" usa una fecha fija bien antigua como piso.
    const { start, end } = resolveDateRange(range, new Date(), range === "ALL" ? "1990-01-01" : undefined);
    const fromUnix = Math.floor(new Date(`${start}T00:00:00Z`).getTime() / 1000);
    const toUnix = Math.floor(new Date(`${end}T00:00:00Z`).getTime() / 1000) + 86_400;

    const priceHistory = await fetchDailyCloses(ticker, fromUnix, toUnix);
    return NextResponse.json({ ticker, range, priceHistory });
  } catch (error) {
    console.error(`[GET /api/stock-history] ${ticker}`, error);
    return NextResponse.json({ error: "Error obteniendo histórico de precios" }, { status: 500 });
  }
}
