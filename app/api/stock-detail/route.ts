// GET /api/stock-detail?ticker=AAPL → toda la info pública disponible
// gratis de una acción: cotización, perfil, métricas, estados
// financieros (as-reported), noticias, recomendaciones de analistas,
// comparables y un histórico de precio de 1 año.
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
import { fetchDailyCloses } from "@/lib/yahoo/client";

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

  const toUnix = Math.floor(Date.now() / 1000);
  const fromUnix = toUnix - 366 * 86_400;

  const [quote, profile, financials, statements, news, recommendations, peers, priceHistory] =
    await Promise.all([
      safe(fetchQuote(ticker), null),
      safe(fetchFullCompanyProfile(ticker), null),
      safe(fetchBasicFinancials(ticker), {}),
      safe(fetchFinancialsReported(ticker, "annual"), []),
      safe(fetchCompanyNews(ticker, daysAgoISO(21), todayISO()), []),
      safe(fetchRecommendationTrends(ticker), []),
      safe(fetchPeers(ticker), []),
      safe(fetchDailyCloses(ticker, fromUnix, toUnix), []),
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
    priceHistory,
  });
}
