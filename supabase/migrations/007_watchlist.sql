-- ─────────────────────────────────────────────────────────────
-- MIGRACIÓN 007 — Watchlist
-- Ejecutar en: Supabase Dashboard → SQL Editor
--
-- Tabla nueva (sin datos previos que migrar) — a diferencia de
-- transactions/broker_fundings, aquí sí se puede poner NOT NULL +
-- DEFAULT auth.uid() + RLS desde el primer momento, en una sola
-- migración.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS watchlist (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker     TEXT NOT NULL CHECK (char_length(ticker) BETWEEN 1 AND 15),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, ticker)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_user_id ON watchlist (user_id);

ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_watchlist" ON watchlist
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert_own_watchlist" ON watchlist
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_watchlist" ON watchlist
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE watchlist IS
  'Acciones que el usuario sigue sin necesariamente tenerlas en el portafolio.';
