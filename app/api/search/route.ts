// GET /api/search?q=apple → sugerencias de tickers en tiempo real
// Proxy que oculta FINNHUB_API_KEY del cliente. Dato público de mercado,
// sin datos del usuario — igual que /api/market-indices y /api/trm, no
// requiere sesión (la app entera ya está detrás del login vía middleware).

import { NextRequest, NextResponse } from "next/server";
import { searchSymbols } from "@/lib/finnhub/client";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q) return NextResponse.json({ results: [] });

  try {
    const results = await searchSymbols(q);
    // Solo acciones comunes — filtra bonos, ETNs, fondos, etc. que
    // solo generan ruido en el autocompletado.
    const filtered = results.filter((r) => r.type === "Common Stock").slice(0, 8);
    return NextResponse.json({ results: filtered });
  } catch (error) {
    console.error("[GET /api/search]", error);
    return NextResponse.json({ error: "Error buscando" }, { status: 500 });
  }
}
