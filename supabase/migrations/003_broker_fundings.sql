-- ─────────────────────────────────────────────────────────────
-- MIGRACIÓN 003 — Fondeos del broker desde Colombia (sección Pesos COP)
-- Ejecutar en: Supabase Dashboard → SQL Editor
--
-- Un "fondeo broker" es un depósito de dólares al broker hecho desde
-- Colombia a través de un intermediario (ARQ, Global66, etc.) a una
-- TRM específica. Cada fondeo:
--   1. Crea una transacción DEPOSIT normal en `transactions` (afecta
--      efectivo disponible / rendimiento en USD como cualquier otro
--      depósito).
--   2. Guarda aquí el detalle en pesos: método usado, TRM del momento,
--      y la comisión (que puede haberse pagado en USD o en COP).
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS broker_fundings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  broker_method   TEXT NOT NULL CHECK (char_length(broker_method) BETWEEN 1 AND 60),
  trm             NUMERIC(10, 2) NOT NULL CHECK (trm > 0),
  usd_amount      NUMERIC(18, 4) NOT NULL CHECK (usd_amount > 0),
  fee_amount      NUMERIC(18, 4) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  fee_currency    TEXT NOT NULL CHECK (fee_currency IN ('USD', 'COP')),
  fee_usd         NUMERIC(18, 4) NOT NULL DEFAULT 0, -- comisión convertida a USD (precalculada con la TRM de este fondeo)
  fee_cop         NUMERIC(18, 2) NOT NULL DEFAULT 0, -- comisión convertida a COP (precalculada con la TRM de este fondeo)
  date            DATE NOT NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_broker_fundings_date ON broker_fundings (date DESC);

COMMENT ON TABLE broker_fundings IS
  'Depósitos de dólares al broker hechos desde Colombia — detalle en pesos (TRM, método, comisión) de cada DEPOSIT en transactions.';

COMMENT ON COLUMN broker_fundings.fee_usd IS
  'Comisión en USD, ya convertida si se pagó en COP (fee_amount / trm).';

COMMENT ON COLUMN broker_fundings.fee_cop IS
  'Comisión en COP, ya convertida si se pagó en USD (fee_amount × trm).';
