-- ─────────────────────────────────────────────────────────────
-- MIGRACIÓN 006 — RLS multiusuario (paso 2 de 2)
-- Ejecutar en: Supabase Dashboard → SQL Editor
--
-- SOLO correr esto DESPUÉS de:
--   1. Haber creado tu cuenta desde /login.
--   2. Haber corrido el backfill de la migración 005 con tu user id
--      real (que todas las filas existentes tengan user_id NOT NULL).
-- Si corres esto con filas que todavía tienen user_id NULL, el
-- ALTER COLUMN ... SET NOT NULL falla — es intencional, es la
-- protección para no dejar datos huérfanos sin dueño.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE transactions    ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE broker_fundings ALTER COLUMN user_id SET NOT NULL;

-- A partir de ahora, cualquier INSERT sin user_id explícito toma el
-- del usuario autenticado — así el código de la app no necesita
-- pasarlo a mano en cada insert.
ALTER TABLE transactions    ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE broker_fundings ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE transactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE broker_fundings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_transactions" ON transactions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert_own_transactions" ON transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_transactions" ON transactions
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "select_own_broker_fundings" ON broker_fundings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert_own_broker_fundings" ON broker_fundings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_broker_fundings" ON broker_fundings
  FOR DELETE USING (auth.uid() = user_id);
