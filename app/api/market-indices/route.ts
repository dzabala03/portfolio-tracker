// GET /api/market-indices?category=asia|eur|us|oil|bonds|gold|fx|crypto|premkt
// Nivel en vivo de índices/materias primas/FX/cripto por categoría.
// Default: "us" (compatibilidad con el comportamiento anterior).

import { NextRequest, NextResponse } from "next/server";
import { fetchLiveQuotes } from "@/lib/yahoo/client";

export const dynamic = "force-dynamic";

interface IndexDef {
  key: string;
  symbol: string; // "" = sin fuente gratis disponible — se muestra "Sin datos"
  label: string;
}

// Todos los símbolos con "=F"/"=X"/"-USD"/"^" fueron validados a mano contra
// el endpoint de Yahoo antes de usarlos aquí (ver lib/finance/formulas.md).
// Los bonos internacionales (Bund/JPN/UK/FRA 10-YR) NO tienen equivalente
// gratis en Yahoo — solo publican el índice de rendimiento del Tesoro de
// EE.UU. (^TNX) gratis; por eso esos 4 quedan con symbol: "".
const CATEGORIES: Record<string, IndexDef[]> = {
  asia: [
    { key: "ASX200",   symbol: "^AXJO",     label: "ASX 200" },
    { key: "NIKKEI",   symbol: "^N225",     label: "NIKKEI" },
    { key: "NIFTY50",  symbol: "^NSEI",     label: "NIFTY 50" },
    { key: "HSI",      symbol: "^HSI",      label: "HSI" },
    { key: "SHANGHAI", symbol: "000001.SS", label: "SHANGHAI" },
  ],
  eur: [
    { key: "STOXX600", symbol: "^STOXX",     label: "STOXX600" },
    { key: "DAX",      symbol: "^GDAXI",     label: "DAX" },
    { key: "FTSE",     symbol: "^FTSE",      label: "FTSE" },
    { key: "CAC",      symbol: "^FCHI",      label: "CAC" },
    { key: "FTSEMIB",  symbol: "FTSEMIB.MI", label: "FTSE MIB" },
  ],
  us: [
    { key: "DOWJONES",    symbol: "^DJI",  label: "DJIA" },
    { key: "SP500",       symbol: "^GSPC", label: "S&P 500" },
    { key: "NASDAQ",      symbol: "^IXIC", label: "NASDAQ" },
    { key: "NASDAQ100",   symbol: "^NDX",  label: "NASDAQ 100" },
    { key: "RUSSELL2000", symbol: "^RUT",  label: "RUSS 2K" },
  ],
  oil: [
    { key: "OIL",     symbol: "CL=F", label: "OIL" },
    { key: "BRENT",   symbol: "BZ=F", label: "BRENT" },
    { key: "NATGAS",  symbol: "NG=F", label: "NAT GAS" },
    { key: "RBOB",    symbol: "RB=F", label: "RBOB GAS" },
    { key: "ULSDHO",  symbol: "HO=F", label: "ULSD HO" },
  ],
  bonds: [
    { key: "US10Y", symbol: "^TNX", label: "US 10-YR" },
    { key: "DE10Y", symbol: "",     label: "Bund 10-YR" },
    { key: "JP10Y", symbol: "",     label: "JPN 10-YR" },
    { key: "UK10Y", symbol: "",     label: "UK 10-YR" },
    { key: "FR10Y", symbol: "",     label: "FRA 10-YR" },
  ],
  gold: [
    { key: "GOLD",      symbol: "GC=F", label: "GOLD" },
    { key: "SILVER",    symbol: "SI=F", label: "SILVER" },
    { key: "COPPER",    symbol: "HG=F", label: "COPPER" },
    { key: "PLATINUM",  symbol: "PL=F", label: "PLATINUM" },
    { key: "PALLADIUM", symbol: "PA=F", label: "PALLADIUM" },
  ],
  fx: [
    { key: "EURUSD", symbol: "EURUSD=X", label: "EUR/USD" },
    { key: "GBPUSD", symbol: "GBPUSD=X", label: "GBP/USD" },
    { key: "USDJPY", symbol: "USDJPY=X", label: "USD/JPY" },
    { key: "USDCAD", symbol: "USDCAD=X", label: "USD/CAD" },
    { key: "DXY",    symbol: "DX-Y.NYB", label: "DXY" },
  ],
  crypto: [
    { key: "BITCOIN",  symbol: "BTC-USD",  label: "BITCOIN" },
    { key: "ETHER",    symbol: "ETH-USD",  label: "ETHER" },
    { key: "SOLANA",   symbol: "SOL-USD",  label: "SOLANA" },
    { key: "DOGECOIN", symbol: "DOGE-USD", label: "DOGECOIN" },
    { key: "XRP",      symbol: "XRP-USD",  label: "XRP" },
  ],
  premkt: [
    { key: "DOWFUT",   symbol: "YM=F", label: "DOW FUT" },
    { key: "SPFUT",    symbol: "ES=F", label: "S&P FUT" },
    { key: "NASFUT",   symbol: "NQ=F", label: "NAS FUT" },
    { key: "OILFUT",   symbol: "CL=F", label: "OIL" },
    { key: "US10YFUT", symbol: "^TNX", label: "US 10-YR" },
  ],
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = (searchParams.get("category") ?? "us").toLowerCase();

  const items = CATEGORIES[category];
  if (!items) {
    return NextResponse.json(
      { error: `categoría inválida: "${category}". Válidas: ${Object.keys(CATEGORIES).join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const withSymbol = items.filter((i) => i.symbol);
    const quotes = await fetchLiveQuotes(withSymbol.map((i) => i.symbol));

    const indices = items.map((i) => {
      if (!i.symbol) return { key: i.key, label: i.label, error: true as const };
      const q = quotes.get(i.symbol.toUpperCase());
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

    return NextResponse.json({ category, indices });
  } catch (error) {
    console.error(`[GET /api/market-indices] category=${category}`, error);
    return NextResponse.json({ error: "Error obteniendo datos de mercado" }, { status: 500 });
  }
}
