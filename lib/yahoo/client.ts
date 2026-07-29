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
  const url = `${YAHOO_CHART_URL}/${encodeURIComponent(ticker.toUpperCase())}?period1=${fromUnix}&period2=${toUnix}&interval=1d`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    next: { revalidate: 1800 }, // precios de cierre de días pasados no cambian; 30min es solo para no golpear Yahoo en cada request
  });

  if (!res.ok) {
    throw new Error(`[Yahoo] fetchDailyCloses(${ticker}): HTTP ${res.status}`);
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
