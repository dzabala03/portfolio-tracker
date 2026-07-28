-- ─────────────────────────────────────────────────────────────
-- MIGRACIÓN 002 — Soporte para movimientos de efectivo
-- Ejecutar en: Supabase Dashboard → SQL Editor
--
-- El esquema de 001 solo permitía BUY/SELL con shares > 0, así que
-- toda fila de tipo DIVIDEND / DEPOSIT / WITHDRAWAL / FEE / INTEREST
-- importada desde CSV era rechazada con el error 23514.
--
-- Convención para movimientos de efectivo:
--   ticker = 'CASH'  ·  shares = 0  ·  price = monto total
-- ─────────────────────────────────────────────────────────────

-- 1. Ampliar los tipos permitidos
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_type_check
  CHECK (type IN (
    'BUY', 'SELL',
    'DIVIDEND', 'DEPOSIT', 'WITHDRAWAL', 'FEE', 'INTEREST'
  ));

-- 2. shares > 0 solo aplica a operaciones de trading
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_shares_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_shares_check
  CHECK (
    CASE WHEN type IN ('BUY', 'SELL') THEN shares > 0 ELSE shares = 0 END
  );

-- 3. price > 0 en trades; en efectivo es un monto que puede ser 0
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_price_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_price_check
  CHECK (
    CASE WHEN type IN ('BUY', 'SELL') THEN price > 0 ELSE price >= 0 END
  );

COMMENT ON COLUMN transactions.shares IS
  'Cantidad de acciones en BUY/SELL (admite fracciones). Siempre 0 en movimientos de efectivo.';

COMMENT ON COLUMN transactions.price IS
  'Precio por acción en USD en BUY/SELL. Monto total del movimiento en tipos de efectivo.';
