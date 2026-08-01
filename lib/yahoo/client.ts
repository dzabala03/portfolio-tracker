// ─────────────────────────────────────────────────────────────
// YAHOO FINANCE CLIENT — histórico diario de precios
//
// Endpoint no oficial (`query1.finance.yahoo.com/v8/finance/chart`),
// sin API key. Se usa porque el free tier de Finnhub rechaza
// /stock/candle para acciones US (403 — solo forex/crypto).
//
// ⚠️ No es una API documentada/soportada por Yahoo. Puede cambiar o
// dejar de funcionar sin aviso. Si eso pasa, revisar primero si
// cambió el shape de la respuesta antes de asumir que el ticker
// no tiene datos.
// ─────────────────────────────────────────────────────────────

export interface DailyClose {
  date: string; // "YYYY-MM-DD"
  close: number;
}

const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

// Tickers de brokers que no listan en NYSE/NASDAQ necesitan el sufijo de
// bolsa que usa Yahoo, o resuelven 404 con el símbolo "pelado" del CSV.
// ⚠️ Nota de moneda: estos símbolos cotizan en su moneda local (ej. EUR
// en Euronext), no en USD. Si el precio ya guardado en tus transacciones
// viene en esa misma moneda local (broker multi-moneda), el histórico
// queda internamente consistente; si no, introduce un sesgo de tipo de
// cambio en la valoración de esa posición específica.
const TICKER_ALIASES: Record<string, string> = {
  VRLA: "VRLA.PA", // Verallia S.A. — Euronext Paris, no NYSE/NASDAQ
  GSY: "GSY.TO",   // goeasy Ltd. — TSX (AMEX/TSX en el CSV, no NASDAQ/NYSE).
                    // ⚠️ Sin este alias, "GSY" resolvía silenciosamente a un
                    // ETF de bonos completamente distinto (Invesco Ultra
                    // Short Duration ETF) — mismo orden de magnitud de precio
                    // por pura coincidencia, sin error, sin dar ninguna pista.
  FI: "FISV",       // Fiserv Inc. — ticker actual "FI" no indexado en Yahoo;
                    // solo responde bajo el símbolo legado pre-rebranding.
};

function resolveYahooSymbol(ticker: string): string {
  const upper = ticker.toUpperCase();
  return TICKER_ALIASES[upper] ?? upper;
}

function toISODate(unixSeconds: number, timezoneOffsetSeconds: number): string {
  // Yahoo entrega timestamps en UTC; usamos el offset de la bolsa
  // (viene en la respuesta) para no correr la fecha al día siguiente/anterior.
  const d = new Date((unixSeconds + timezoneOffsetSeconds) * 1000);
  return d.toISOString().slice(0, 10);
}

export async function fetchDailyCloses(
  ticker: string,
  fromUnix: number,
  toUnix: number
): Promise<DailyClose[]> {
  const symbol = resolveYahooSymbol(ticker);
  const url = `${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}?period1=${fromUnix}&period2=${toUnix}&interval=1d`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    next: { revalidate: 1800 }, // precios de cierre de días pasados no cambian; 30min es solo para no golpear Yahoo en cada request
  });

  if (!res.ok) {
    throw new Error(`[Yahoo] fetchDailyCloses(${ticker}) [símbolo ${symbol}]: HTTP ${res.status}`);
  }

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) {
    const errMsg = json?.chart?.error?.description ?? "sin datos";
    throw new Error(`[Yahoo] fetchDailyCloses(${ticker}): ${errMsg}`);
  }

  const timestamps: number[] = result.timestamp ?? [];
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
  const gmtOffset: number = result.meta?.gmtoffset ?? 0;

  const out: DailyClose[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];
    if (close === null || close === undefined) continue; // día sin cierre válido (feriado a medias, gap de datos)
    out.push({ date: toISODate(timestamps[i], gmtOffset), close });
  }
  return out;
}

// ─── Cotización en vivo (índices, o cualquier símbolo) ────────
//
// El array diario de velas de Yahoo puede quedarse "hasta ayer" durante
// la sesión de hoy. `meta.regularMarketPrice` en cambio se actualiza en
// vivo (con el delay normal de datos gratuitos) — se usa para tarjetas
// de mercado y para no dejar la línea de comparación un día atrás.

export interface LiveQuote {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  change: number;
  changePct: number;
  date: string;      // "YYYY-MM-DD" del último dato, en la zona de la bolsa
  time: number;       // unix seconds de regularMarketTime
  timezone: string;   // abreviación, ej. "EDT" (para mostrar)
  timezoneName: string; // IANA, ej. "America/New_York" (para formatear con Intl)
}

export async function fetchLiveQuote(ticker: string): Promise<LiveQuote> {
  const symbol = resolveYahooSymbol(ticker);
  const url = `${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}?range=1d&interval=1m`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    next: { revalidate: 30 }, // dato "en vivo" — refrescar seguido, sin golpear Yahoo en cada render
  });

  if (!res.ok) {
    throw new Error(`[Yahoo] fetchLiveQuote(${ticker}) [símbolo ${symbol}]: HTTP ${res.status}`);
  }

  const json = await res.json();
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta || typeof meta.regularMarketPrice !== "number") {
    const errMsg = json?.chart?.error?.description ?? "sin datos";
    throw new Error(`[Yahoo] fetchLiveQuote(${ticker}): ${errMsg}`);
  }

  const price = meta.regularMarketPrice;
  const previousClose = meta.previousClose ?? meta.chartPreviousClose ?? price;
  const gmtOffset = meta.gmtoffset ?? 0;

  return {
    symbol: ticker.toUpperCase(),
    name: meta.longName ?? meta.shortName ?? ticker.toUpperCase(),
    price,
    previousClose,
    change: price - previousClose,
    changePct: previousClose !== 0 ? ((price - previousClose) / previousClose) * 100 : 0,
    date: toISODate(meta.regularMarketTime, gmtOffset),
    time: meta.regularMarketTime,
    timezone: meta.timezone ?? "",
    timezoneName: meta.exchangeTimezoneName ?? "America/New_York",
  };
}

export async function fetchLiveQuotes(tickers: string[]): Promise<Map<string, LiveQuote>> {
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()))];
  const results = await Promise.allSettled(unique.map((t) => fetchLiveQuote(t)));

  const quoteMap = new Map<string, LiveQuote>();
  for (let i = 0; i < unique.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      quoteMap.set(unique[i], result.value);
    } else {
      console.error(`[Yahoo] Error fetching live quote ${unique[i]}:`, result.reason);
    }
  }
  return quoteMap;
}

// ─── Post-market (derivado de velas de 1 min, no de meta) ────
//
// El resumen `meta.postMarketPrice`/`postMarketChange` de Yahoo no se
// pobló en pruebas (ni minutos después del cierre, con tickers muy
// líquidos) — puede ser una limitación de este endpoint no oficial en
// este entorno. Pero las velas de 1 minuto SÍ siguen llegando después
// del cierre, así que el precio post-market se deriva comparando el
// último precio disponible contra el cierre de la sesión regular.

// Se muestra siempre que el mercado NO esté en sesión regular — sin
// cortar a las 8pm. Fuera de la sesión regular, el último precio
// disponible en las velas de Yahoo es el de post-market de la última
// sesión (puede quedar "viejo" un fin de semana o de madrugada, pero
// sigue siendo el último movimiento real conocido, que es lo que se
// pidió mostrar: post-market mientras el mercado no esté abierto).
export function isPostMarketWindow(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  if (weekday === "Sat" || weekday === "Sun") return true; // fin de semana: mercado siempre cerrado
  const minutesSinceMidnight = hour * 60 + minute;
  const regularOpen = 9 * 60 + 30;
  const regularClose = 16 * 60;
  return minutesSinceMidnight < regularOpen || minutesSinceMidnight >= regularClose;
}

export interface PostMarketQuote {
  regularClose: number;
  price: number;
  change: number;
  changePct: number;
  time: number; // unix seconds de la última vela disponible
}

export async function fetchPostMarketQuote(ticker: string): Promise<PostMarketQuote | null> {
  const symbol = resolveYahooSymbol(ticker);
  const url = `${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}?range=1d&interval=1m&includePrePost=true`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`[Yahoo] fetchPostMarketQuote(${ticker}) [símbolo ${symbol}]: HTTP ${res.status}`);

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) {
    const errMsg = json?.chart?.error?.description ?? "sin datos";
    throw new Error(`[Yahoo] fetchPostMarketQuote(${ticker}): ${errMsg}`);
  }

  const timestamps: number[] = result.timestamp ?? [];
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
  const regularEnd: number | undefined = result.meta?.currentTradingPeriod?.regular?.end;
  if (timestamps.length === 0 || regularEnd === undefined) return null;

  // Última vela EN O ANTES del fin de la sesión regular = cierre regular.
  let regularCloseIdx = -1;
  for (let i = 0; i < timestamps.length; i++) {
    if (timestamps[i] <= regularEnd && closes[i] !== null && closes[i] !== undefined) regularCloseIdx = i;
  }
  if (regularCloseIdx === -1) return null;

  // Última vela con precio válido, sea la que sea (si aún no hay
  // actividad post-market, coincide con la del cierre regular).
  let lastIdx = -1;
  for (let i = timestamps.length - 1; i >= 0; i--) {
    if (closes[i] !== null && closes[i] !== undefined) { lastIdx = i; break; }
  }
  if (lastIdx <= regularCloseIdx) return null; // no hay vela posterior al cierre todavía

  const regularClose = closes[regularCloseIdx]!;
  const price = closes[lastIdx]!;
  return {
    regularClose,
    price,
    change: price - regularClose,
    changePct: regularClose !== 0 ? ((price - regularClose) / regularClose) * 100 : 0,
    time: timestamps[lastIdx],
  };
}

export async function fetchPostMarketQuotes(tickers: string[]): Promise<Map<string, PostMarketQuote>> {
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()))];
  const results = await Promise.allSettled(unique.map((t) => fetchPostMarketQuote(t)));

  const quoteMap = new Map<string, PostMarketQuote>();
  for (let i = 0; i < unique.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled" && result.value) {
      quoteMap.set(unique[i], result.value);
    } else if (result.status === "rejected") {
      console.error(`[Yahoo] Error fetching post-market ${unique[i]}:`, result.reason);
    }
  }
  return quoteMap;
}

// ─── Múltiples tickers en paralelo ───────────────────────────

export async function fetchDailyClosesForTickers(
  tickers: string[],
  fromUnix: number,
  toUnix: number
): Promise<Map<string, Map<string, number>>> {
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()))];

  const results = await Promise.allSettled(
    unique.map((ticker) => fetchDailyCloses(ticker, fromUnix, toUnix))
  );

  const byTicker = new Map<string, Map<string, number>>();
  for (let i = 0; i < unique.length; i++) {
    const result = results[i];
    const closesByDate = new Map<string, number>();
    if (result.status === "fulfilled") {
      for (const { date, close } of result.value) closesByDate.set(date, close);
    } else {
      console.error(`[Yahoo] Error fetching ${unique[i]}:`, result.reason);
    }
    byTicker.set(unique[i], closesByDate);
  }
  return byTicker;
}
