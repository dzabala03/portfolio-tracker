// GET /api/stock-detail?ticker=AAPL → toda la info pública disponible
// gratis de una acción: cotización, perfil, métricas, estados
// financieros (as-reported), noticias, recomendaciones de analistas y
// comparables. El histórico de precio vive en /api/stock-history (con
// su propio selector de rango) para no re-pedir todo esto cada vez que
// el usuario cambia el rango del mini-gráfico.
//
// Dato público de mercado, no depende del usuario — no requiere sesión
// (igual que /api/market-indices, /api/trm).

import { NextRequest, NextResponse } from "next/server";
import {
  fetchQuote,
  fetchFullCompanyProfile,
  fetchBasicFinancials,
  fetchFinancialsReported,
  fetchCompanyNews,
  fetchRecommendationTrends,
  fetchPeers,
} from "@/lib/finnhub/client";

export const dynamic = "force-dynamic";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoISO(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// Cada fuente puede fallar por separado (ticker extranjero sin
// estados as-reported, sin noticias recientes, etc.) — una pieza
// caída no debe tumbar toda la ficha, solo esa sección.
async function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    console.error("[stock-detail]", err);
    return fallback;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker")?.trim().toUpperCase();

  if (!ticker) {
    return NextResponse.json({ error: "Parámetro 'ticker' requerido" }, { status: 400 });
  }

  const [quote, profile, financials, statements, news, recommendations, peers] =
    await Promise.all([
      safe(fetchQuote(ticker), null),
      safe(fetchFullCompanyProfile(ticker), null),
      safe(fetchBasicFinancials(ticker), {}),
      safe(fetchFinancialsReported(ticker, "annual"), []),
      safe(fetchCompanyNews(ticker, daysAgoISO(21), todayISO()), []),
      safe(fetchRecommendationTrends(ticker), []),
      safe(fetchPeers(ticker), []),
    ]);

  if (!quote && !profile) {
    return NextResponse.json({ error: `No se encontró información para "${ticker}"` }, { status: 404 });
  }

  return NextResponse.json({
    ticker,
    quote,
    profile,
    financials,
    statements,
    news,
    recommendations,
    peers,
  });
}
