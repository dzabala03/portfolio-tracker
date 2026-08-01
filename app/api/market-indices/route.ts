// GET /api/market-indices — nivel en vivo de los principales índices US

import { NextResponse } from "next/server";
import { fetchLiveQuotes } from "@/lib/yahoo/client";

export const dynamic = "force-dynamic";

const INDICES: { key: string; symbol: string; label: string }[] = [
  { key: "DOWJONES",    symbol: "^DJI",  label: "DJIA" },
  { key: "SP500",       symbol: "^GSPC", label: "S&P 500" },
  { key: "NASDAQ",      symbol: "^IXIC", label: "NASDAQ" },
  { key: "NASDAQ100",   symbol: "^NDX",  label: "NASDAQ 100" },
  { key: "RUSSELL2000", symbol: "^RUT",  label: "RUSS 2K" },
];

export async function GET() {
  try {
    const quotes = await fetchLiveQuotes(INDICES.map((i) => i.symbol));

    const indices = INDICES.map((i) => {
      const q = quotes.get(i.symbol);
      if (!q) return { key: i.key, label: i.label, error: true as const };
      return {
        key: i.key,
        label: i.label,
        price: q.price,
        change: q.change,
        changePct: q.changePct,
        time: q.time,
        timezone: q.timezone,
        timezoneName: q.timezoneName,
        error: false as const,
      };
    });

    return NextResponse.json({ indices });
  } catch (error) {
    console.error("[GET /api/market-indices]", error);
    return NextResponse.json({ error: "Error obteniendo índices de mercado" }, { status: 500 });
  }
}
