// GET /api/prices?tickers=AAPL,MSFT,TSLA
// Proxy que oculta FINNHUB_API_KEY del cliente.

import { NextRequest, NextResponse } from "next/server";
import { fetchQuotes } from "@/lib/finnhub/client";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tickersParam = searchParams.get("tickers");

  if (!tickersParam) {
    return NextResponse.json(
      { error: "Parámetro 'tickers' requerido. Ejemplo: ?tickers=AAPL,MSFT" },
      { status: 400 }
    );
  }

  const tickers = tickersParam
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);

  if (tickers.length === 0) {
    return NextResponse.json({ error: "Sin tickers válidos" }, { status: 400 });
  }

  try {
    const quotes = await fetchQuotes(tickers);
    // Convertir Map a objeto para serializar a JSON
    return NextResponse.json(Object.fromEntries(quotes));
  } catch (error) {
    console.error("[/api/prices]", error);
    return NextResponse.json(
      { error: "Error obteniendo precios. Intenta de nuevo." },
      { status: 500 }
    );
  }
}
