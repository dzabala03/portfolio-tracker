-- ─────────────────────────────────────────────────────────────
-- MIGRACIÓN 001 — Esquema inicial portfolio-tracker
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────

-- Tabla de transacciones
-- Es la única fuente de datos. Todo lo demás se calcula en runtime.
CREATE TABLE IF NOT EXISTS transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker      TEXT NOT NULL CHECK (char_length(ticker) BETWEEN 1 AND 10),
  type        TEXT NOT NULL CHECK (type IN ('BUY', 'SELL')),
  shares      NUMERIC(18, 6) NOT NULL CHECK (shares > 0),
  price       NUMERIC(18, 4) NOT NULL CHECK (price > 0),
  fees        NUMERIC(18, 4) NOT NULL DEFAULT 0 CHECK (fees >= 0),
  date        DATE NOT NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_transactions_ticker ON transactions (ticker);
CREATE INDEX IF NOT EXISTS idx_transactions_date   ON transactions (date ASC);
CREATE INDEX IF NOT EXISTS idx_transactions_type   ON transactions (type);

-- Comentarios para documentación
COMMENT ON TABLE transactions IS
  'Historial de transacciones de compra/venta. Fuente de verdad del portafolio.';

COMMENT ON COLUMN transactions.shares IS
  'Cantidad de acciones. Acepta fracciones para brokers que permiten compras fraccionadas.';

COMMENT ON COLUMN transactions.price IS
  'Precio por acción en USD al momento de la transacción.';

COMMENT ON COLUMN transactions.fees IS
  'Comisiones en USD. Se suma al costo en BUY, se resta en SELL.';
