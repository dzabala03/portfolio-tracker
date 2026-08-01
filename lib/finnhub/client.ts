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

// ─── Calendario de earnings (fecha + antes/después de mercado) ──

export interface EarningsEntry {
  date: string;      // "YYYY-MM-DD"
  hour: "bmo" | "amc" | ""; // before market open / after market close / sin confirmar
}

interface FinnhubEarningsCalendarEntry {
  symbol: string;
  date: string;
  hour: string;
}

// El endpoint no filtra por símbolo — devuelve TODAS las empresas del
// rango de fechas. Y viene TRUNCADO a 1500 filas SIN avisar, sin
// importar qué tan angosto sea el rango: probado con una ventana de
// solo 15 días y ya llegaba exacto a 1500, cortando tickers reales
// (MELI, BKNG desaparecían; NU mostraba una fecha de un trimestre
// futuro en vez de la próxima real). Ventanas de 1 día se quedan muy
// por debajo del límite (~350-500 filas), así que se pide día por día
// y se combina — más llamadas, pero es la única forma de no perder
// tickers por el corte silencioso.
async function fetchEarningsCalendarChunk(fromDate: string, toDate: string): Promise<FinnhubEarningsCalendarEntry[]> {
  const apiKey = getApiKey();
  const url = `${FINNHUB_BASE_URL}/calendar/earnings?from=${fromDate}&to=${toDate}&token=${apiKey}`;

  const res = await fetch(url, {
    next: { revalidate: 21_600 }, // el calendario de earnings no cambia dentro del mismo día — cache 6h
  });
  if (!res.ok) throw new Error(`[Finnhub] fetchEarningsCalendar(${fromDate}): HTTP ${res.status}`);

  const data: { earningsCalendar: FinnhubEarningsCalendarEntry[] } = await res.json();
  return data.earningsCalendar ?? [];
}

function addDaysISO(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function fetchEarningsCalendar(
  tickers: string[],
  fromDate: string,
  toDate: string
): Promise<Map<string, EarningsEntry>> {
  const days: string[] = [];
  for (let d = fromDate; d <= toDate; d = addDaysISO(d, 1)) days.push(d);

  // En tandas — free tier de Finnhub es 60 req/min, y una consulta por
  // día del rango completo (~90-120 días) de una sola vez lo superaría.
  const BATCH_SIZE = 15;
  const chunks: FinnhubEarningsCalendarEntry[][] = [];
  for (let i = 0; i < days.length; i += BATCH_SIZE) {
    const batch = days.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map((d) => fetchEarningsCalendarChunk(d, d)));
    for (const result of results) {
      if (result.status === "fulfilled") chunks.push(result.value);
      else console.error("[Finnhub] fetchEarningsCalendar chunk:", result.reason);
    }
  }

  const wanted = new Set(tickers.map((t) => t.toUpperCase()));
  const byTicker = new Map<string, EarningsEntry>();
  for (const entries of chunks) {
    for (const entry of entries) {
      if (!wanted.has(entry.symbol)) continue;
      const existing = byTicker.get(entry.symbol);
      // Nos quedamos con la fecha MÁS PRÓXIMA si hay varias (distintos trimestres).
      if (!existing || entry.date < existing.date) {
        byTicker.set(entry.symbol, { date: entry.date, hour: (entry.hour as EarningsEntry["hour"]) ?? "" });
      }
    }
  }
  return byTicker;
}

// Nombre + industria en una sola pasada de /stock/profile2 por ticker
// (evita duplicar llamadas si se necesitan ambos campos).
export async function fetchCompanyProfiles(
  tickers: string[]
): Promise<Map<string, { name: string; industry: string }>> {
  const profileMap = new Map<string, { name: string; industry: string }>();
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()))];

  const results = await Promise.allSettled(
    unique.map((ticker) => fetchCompanyProfile(ticker))
  );

  for (let i = 0; i < unique.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled" && result.value) {
      profileMap.set(unique[i], { name: result.value.name, industry: result.value.industry });
    } else {
      profileMap.set(unique[i], { name: unique[i], industry: "" }); // fallback: usar el ticker
    }
  }

  return profileMap;
}

// ─── Buscador de tickers (autocompletado) ─────────────────────
// Endpoint /search — gratis en el free tier, sin restricción de bolsa.

export interface SearchResult {
  symbol: string;
  description: string;
  type: string;
}

export async function searchSymbols(query: string): Promise<SearchResult[]> {
  const apiKey = getApiKey();
  const url = `${FINNHUB_BASE_URL}/search?q=${encodeURIComponent(query)}&token=${apiKey}`;

  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`[Finnhub] searchSymbols(${query}): HTTP ${res.status}`);

  const data: { result: SearchResult[] } = await res.json();
  return data.result ?? [];
}

// ─── Perfil completo de la empresa (para la ficha de detalle) ──
// A diferencia de fetchCompanyProfile (name/industry/logo, usado por
// el portafolio), esta trae todos los campos — market cap, país, IPO, etc.

export interface FullCompanyProfile {
  ticker: string;
  name: string;
  country: string;
  currency: string;
  exchange: string;
  ipo: string;
  marketCapitalization: number; // en millones de la moneda del mercado
  logo: string;
  shareOutstanding: number; // en millones
  industry: string;
  weburl: string;
}

export async function fetchFullCompanyProfile(ticker: string): Promise<FullCompanyProfile | null> {
  const apiKey = getApiKey();
  const url = `${FINNHUB_BASE_URL}/stock/profile2?symbol=${encodeURIComponent(ticker.toUpperCase())}&token=${apiKey}`;

  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return null;

  const data: FinnhubProfileResponse & {
    country?: string; currency?: string; ipo?: string;
    marketCapitalization?: number; shareOutstanding?: number;
  } = await res.json();
  if (!data.name) return null;

  return {
    ticker: data.ticker ?? ticker.toUpperCase(),
    name: data.name,
    country: data.country ?? "",
    currency: data.currency ?? "",
    exchange: data.exchange ?? "",
    ipo: data.ipo ?? "",
    marketCapitalization: data.marketCapitalization ?? 0,
    logo: data.logo ?? "",
    shareOutstanding: data.shareOutstanding ?? 0,
    industry: data.finnhubIndustry ?? "",
    weburl: data.weburl ?? "",
  };
}

// ─── Métricas básicas (ratios, márgenes, 52 semanas, etc.) ─────
// Endpoint /stock/metric?metric=all — gratis. Devolvemos el objeto
// "metric" casi tal cual; el frontend cura qué campos mostrar.

export async function fetchBasicFinancials(ticker: string): Promise<Record<string, number>> {
  const apiKey = getApiKey();
  const url = `${FINNHUB_BASE_URL}/stock/metric?symbol=${encodeURIComponent(ticker.toUpperCase())}&metric=all&token=${apiKey}`;

  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`[Finnhub] fetchBasicFinancials(${ticker}): HTTP ${res.status}`);

  const data: { metric: Record<string, number> } = await res.json();
  return data.metric ?? {};
}

// ─── Estados financieros tal como se reportaron a la SEC ───────
// Endpoint /stock/financials-reported — gratis (a diferencia de
// /stock/financials, que SÍ está bloqueado en el free tier). Viene
// directo de los 10-K/10-Q, con line items en bruto (concept/label/value).

export interface FinancialLineItem {
  concept: string;
  unit: string;
  label: string;
  value: number;
}

export interface FinancialReport {
  year: number;
  quarter: number;
  form: string; // "10-K" | "10-Q"
  startDate: string;
  endDate: string;
  filedDate: string;
  report: {
    bs: FinancialLineItem[]; // balance sheet
    ic: FinancialLineItem[]; // income statement
    cf: FinancialLineItem[]; // cash flow
  };
}

export async function fetchFinancialsReported(
  ticker: string,
  freq: "annual" | "quarterly" = "annual"
): Promise<FinancialReport[]> {
  const apiKey = getApiKey();
  const url = `${FINNHUB_BASE_URL}/stock/financials-reported?symbol=${encodeURIComponent(ticker.toUpperCase())}&freq=${freq}&token=${apiKey}`;

  const res = await fetch(url, { next: { revalidate: 21_600 } });
  if (!res.ok) throw new Error(`[Finnhub] fetchFinancialsReported(${ticker}): HTTP ${res.status}`);

  const data: { data: FinancialReport[] } = await res.json();
  return data.data ?? [];
}

// ─── Noticias recientes de la empresa ──────────────────────────

export interface NewsItem {
  datetime: number; // unix seconds
  headline: string;
  summary: string;
  source: string;
  url: string;
  image: string;
}

export async function fetchCompanyNews(ticker: string, from: string, to: string): Promise<NewsItem[]> {
  const apiKey = getApiKey();
  const url = `${FINNHUB_BASE_URL}/company-news?symbol=${encodeURIComponent(ticker.toUpperCase())}&from=${from}&to=${to}&token=${apiKey}`;

  const res = await fetch(url, { next: { revalidate: 1800 } });
  if (!res.ok) throw new Error(`[Finnhub] fetchCompanyNews(${ticker}): HTTP ${res.status}`);

  const data: NewsItem[] = await res.json();
  return data.slice(0, 12);
}

// ─── Tendencia de recomendaciones de analistas ─────────────────

export interface RecommendationTrend {
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

export async function fetchRecommendationTrends(ticker: string): Promise<RecommendationTrend[]> {
  const apiKey = getApiKey();
  const url = `${FINNHUB_BASE_URL}/stock/recommendation?symbol=${encodeURIComponent(ticker.toUpperCase())}&token=${apiKey}`;

  const res = await fetch(url, { next: { revalidate: 21_600 } });
  if (!res.ok) throw new Error(`[Finnhub] fetchRecommendationTrends(${ticker}): HTTP ${res.status}`);

  return res.json();
}

// ─── Empresas comparables (mismo sector) ───────────────────────

export async function fetchPeers(ticker: string): Promise<string[]> {
  const apiKey = getApiKey();
  const url = `${FINNHUB_BASE_URL}/stock/peers?symbol=${encodeURIComponent(ticker.toUpperCase())}&token=${apiKey}`;

  const res = await fetch(url, { next: { revalidate: 21_600 } });
  if (!res.ok) return [];

  const data: string[] = await res.json();
  return data.filter((p) => p.toUpperCase() !== ticker.toUpperCase()).slice(0, 8);
}
