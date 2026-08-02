-- ─────────────────────────────────────────────────────────────
-- MIGRACIÓN 008 — Alertas de precio (acciones y TRM)
-- Ejecutar en: Supabase Dashboard → SQL Editor
--
-- Tabla nueva — igual que watchlist, NOT NULL + DEFAULT auth.uid() +
-- RLS desde el primer momento.
--
-- `last_notified_date` es la clave del "solo una vez al día": el cron
-- (/api/cron/check-alerts) solo manda el correo si la condición se
-- cumple Y last_notified_date todavía no es hoy — así no importa
-- cuántas veces el precio cruce el umbral en el mismo día, el correo
-- sale una sola vez. Al día siguiente, si la condición sigue
-- cumpliéndose, vuelve a avisar.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS price_alerts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  kind               TEXT NOT NULL CHECK (kind IN ('stock', 'trm')),
  ticker             TEXT,   -- NULL para alertas de TRM (kind = 'trm')
  direction          TEXT NOT NULL CHECK (direction IN ('above', 'below')),
  threshold          NUMERIC(18, 4) NOT NULL CHECK (threshold > 0),
  last_notified_date DATE,   -- NULL = nunca se ha disparado
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ticker_required_for_stock CHECK (kind = 'trm' OR ticker IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_price_alerts_user_id ON price_alerts (user_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_kind_ticker ON price_alerts (kind, ticker);

ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_price_alerts" ON price_alerts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert_own_price_alerts" ON price_alerts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_price_alerts" ON price_alerts
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE price_alerts IS
  'Alertas de precio configuradas por el usuario — acciones (kind=stock, requiere ticker) o TRM (kind=trm). El cron diario las revisa con el service role (sin RLS) porque necesita ver las de TODOS los usuarios en una sola pasada.';
