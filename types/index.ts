// ─────────────────────────────────────────────────────────────
// TIPOS CENTRALES — portfolio-tracker
// ─────────────────────────────────────────────────────────────

// ─── Transacciones ───────────────────────────────────────────

export type TransactionType =
  | "BUY"
  | "SELL"
  | "DIVIDEND"   // dividendo recibido
  | "DEPOSIT"    // depósito de capital
  | "WITHDRAWAL" // retiro de capital
  | "FEE"        // comisión / impuesto
  | "INTEREST";  // interés recibido

export const TRADING_TYPES: TransactionType[] = ["BUY", "SELL"];
export const CASH_TYPES: TransactionType[] = [
  "DIVIDEND", "DEPOSIT", "WITHDRAWAL", "FEE", "INTEREST",
];

export interface Transaction {
  id: string;
  ticker: string;        // ticker de la acción o "CASH" para movimientos de efectivo
  type: TransactionType;
  shares: number;        // 0 para movimientos de efectivo
  price: number;         // precio por acción (o monto total para movimientos de efectivo)
  fees: number;
  date: string;          // ISO date "YYYY-MM-DD"
  notes?: string;
  created_at: string;
}

export type NewTransaction = Omit<Transaction, "id" | "created_at">;

// ─── Fondeos del broker desde Colombia (sección Pesos COP) ───

export type FeeCurrency = "USD" | "COP";

export interface BrokerFunding {
  id: string;
  transaction_id: string | null; // null = no se creó DEPOSIT — no cuenta para el portafolio USD
  broker_method: string; // "ARQ", "Global66", "Otro: ...", etc.
  trm: number;
  usd_amount: number;
  fee_amount: number;    // en la moneda original que se pagó
  fee_currency: FeeCurrency;
  fee_usd: number;       // ya convertida
  fee_cop: number;       // ya convertida
  date: string;
  notes?: string;
  created_at: string;
}

export type NewBrokerFunding = Omit<BrokerFunding, "id" | "transaction_id" | "fee_usd" | "fee_cop" | "created_at"> & {
  include_in_portfolio: boolean; // si es false, no se crea la transacción DEPOSIT
};

// ─── TRM (Tasa Representativa del Mercado, Colombia) ──────────

export interface TrmQuote {
  value: number;
  previousValue: number;
  change: number;
  changePct: number;
  date: string;
}

// ─── Precios de mercado (Finnhub) ────────────────────────────

export interface Quote {
  ticker: string;
  currentPrice: number;
  change: number;
  changePct: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  timestamp: number;
}

// ─── Holdings calculados ─────────────────────────────────────

export interface Holding {
  ticker: string;
  companyName: string;
  industry: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  currentValue: number;
  investedValue: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  realizedPnL: number;   // ganado/perdido en ventas pasadas de este ticker (histórico completo)
  totalPnL: number;      // realizedPnL + unrealizedPnL — ganancia/pérdida de toda la relación con el ticker
  dailyChange: number;
  dailyChangePct: number;
  prevClose: number;
  weight: number;

  // Próximos earnings — null si Finnhub no tiene todavía una fecha en el rango consultado.
  nextEarningsDate: string | null;
  earningsTiming: "bmo" | "amc" | "" | null; // antes de apertura / después de cierre / sin confirmar

  // Post-market — solo se calculan durante la ventana 4-8pm ET; null fuera de ella.
  postMarketPrice: number | null;
  postMarketChange: number | null;
  postMarketChangePct: number | null;
}

// ─── Posiciones cerradas (ya no se tienen, pero se operaron alguna vez) ──

export interface ClosedPosition {
  ticker: string;
  companyName: string;
  industry: string;
  realizedPnL: number; // ganancia/pérdida total de este ticker, ya cerrado
}

// ─── Resumen de flujos de caja ───────────────────────────────

export interface CashFlowSummary {
  totalDeposits: number;
  totalWithdrawals: number;
  totalDividends: number;
  totalFees: number;
  totalInterest: number;
  netCashFlow: number; // deposits + dividends + interest - withdrawals - fees
}

// ─── Portafolio consolidado ──────────────────────────────────

export interface PortfolioSummary {
  totalValue: number;
  totalInvested: number;
  totalUnrealizedPnL: number;
  totalUnrealizedPnLPct: number;
  totalRealizedPnL: number;
  totalDailyChange: number;
  totalDailyChangePct: number;
  holdingsCount: number;
  cashFlow: CashFlowSummary;
  cashAvailable: number;
  cashAvailablePct: number;
  totalReturn: number;
  totalReturnPct: number;
  lastUpdated: string;

  // Post-market agregado — null fuera de la ventana 4-8pm ET.
  postMarketChange: number | null;
  postMarketChangePct: number | null;
}

// ─── CSV Import ──────────────────────────────────────────────

export interface CsvImportResult {
  valid: NewTransaction[];
  skipped: number;   // filas ignoradas (tipos desconocidos del broker)
  errors: { row: number; message: string }[];
}