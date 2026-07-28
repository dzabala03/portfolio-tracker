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
  shares: number;
  avgCost: number;
  currentPrice: number;
  currentValue: number;
  investedValue: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  dailyChange: number;
  dailyChangePct: number;
  prevClose: number;
  weight: number;
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
  lastUpdated: string;
}

// ─── CSV Import ──────────────────────────────────────────────

export interface CsvImportResult {
  valid: NewTransaction[];
  skipped: number;   // filas ignoradas (tipos desconocidos del broker)
  errors: { row: number; message: string }[];
}