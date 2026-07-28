// ─────────────────────────────────────────────────────────────
// FINNHUB CLIENT — Solo servidor (API routes)
// Documentación oficial: https://finnhub.io/docs/api
//
// Endpoints usados:
//   GET /quote           → cotización en tiempo real
//   GET /stock/profile2  → nombre de empresa, sector, etc.
//
// Free tier: 60 llamadas/minuto
// ⚠️ Verifica la respuesta contra la documentación oficial si algo falla.
// ─────────────────────────────────────────────────────────────

import type { Quote } from "@/types";

const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";

function getApiKey(): string {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) {
    throw new Error(
      "[Finnhub] Falta FINNHUB_API_KEY en .env.local. Regístrate en https://finnhub.io/register"
    );
  }
  return key;
}

// ─── Tipos internos Finnhub ───────────────────────────────────

// Campos de respuesta del endpoint /quote
// Fuente: https://finnhub.io/docs/api/quote
interface FinnhubQuoteResponse {
  c: number;  // current price
  d: number;  // change
  dp: number; // percent change
  h: number;  // high of day
  l: number;  // low of day
  o: number;  // open
  pc: number; // previous close
  t: number;  // unix timestamp
}

// Campos relevantes del endpoint /stock/profile2
interface FinnhubProfileResponse {
  name: string;
  ticker: string;
  exchange: string;
  industry: string;
  logo: string;
  weburl: string;
  finnhubIndustry: string;
}

// ─── Obtener cotización de una acción ────────────────────────

export async function fetchQuote(ticker: string): Promise<Quote> {
  const apiKey = getApiKey();
  const url = `${FINNHUB_BASE_URL}/quote?symbol=${encodeURIComponent(ticker.toUpperCase())}&token=${apiKey}`;

  const res = await fetch(url, {
    next: { revalidate: 60 }, // caché Next.js: re-fetch cada 60s
  });

  if (!res.ok) {
    throw new Error(`[Finnhub] fetchQuote(${ticker}): HTTP ${res.status}`);
  }

  const data: FinnhubQuoteResponse = await res.json();

  // Verificación básica: si current price es 0, el ticker probablemente es inválido
  if (data.c === 0 && data.pc === 0) {
    throw new Error(
      `[Finnhub] fetchQuote(${ticker}): precio 0 — verifica que el ticker sea válido en NYSE/NASDAQ`
    );
  }

  return {
    ticker: ticker.toUpperCase(),
    currentPrice: data.c,
    change: data.d,
    changePct: data.dp,
    high: data.h,
    low: data.l,
    open: data.o,
    prevClose: data.pc,
    timestamp: data.t,
  };
}

// ─── Obtener cotizaciones de múltiples tickers ───────────────

export async function fetchQuotes(tickers: string[]): Promise<Map<string, Quote>> {
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()))];

  // Llamadas en paralelo — con el free tier de Finnhub (60 req/min)
  // esto es seguro para portafolios de hasta ~50 tickers
  const results = await Promise.allSettled(
    unique.map((ticker) => fetchQuote(ticker))
  );

  const quoteMap = new Map<string, Quote>();
  for (let i = 0; i < unique.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      quoteMap.set(unique[i], result.value);
    } else {
      // Log sin romper el portafolio completo
      console.error(`[Finnhub] Error fetching ${unique[i]}:`, result.reason);
    }
  }

  return quoteMap;
}

// ─── Obtener nombre de empresa ────────────────────────────────

export async function fetchCompanyProfile(
  ticker: string
): Promise<{ name: string; industry: string; logo: string } | null> {
  const apiKey = getApiKey();
  const url = `${FINNHUB_BASE_URL}/stock/profile2?symbol=${encodeURIComponent(ticker.toUpperCase())}&token=${apiKey}`;

  const res = await fetch(url, {
    next: { revalidate: 3600 }, // caché 1h — el nombre no cambia frecuentemente
  });

  if (!res.ok) return null;

  const data: FinnhubProfileResponse = await res.json();
  if (!data.name) return null;

  return {
    name: data.name,
    industry: data.finnhubIndustry ?? data.industry ?? "",
    logo: data.logo ?? "",
  };
}

export async function fetchCompanyNames(
  tickers: string[]
): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>();
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()))];

  const results = await Promise.allSettled(
    unique.map((ticker) => fetchCompanyProfile(ticker))
  );

  for (let i = 0; i < unique.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled" && result.value) {
      nameMap.set(unique[i], result.value.name);
    } else {
      nameMap.set(unique[i], unique[i]); // fallback: usar el ticker
    }
  }

  return nameMap;
}
