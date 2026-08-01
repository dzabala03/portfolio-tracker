-- ─────────────────────────────────────────────────────────────
-- MIGRACIÓN 005 — user_id (paso 1 de 2 para multiusuario)
-- Ejecutar en: Supabase Dashboard → SQL Editor
--
-- Se agrega NULLABLE a propósito: todavía no hay ningún usuario en
-- auth.users con datos existentes, así que un DEFAULT/NOT NULL
-- fallaría al backfillear las filas actuales. Antes de la migración
-- 006 (que sí exige NOT NULL + activa RLS), hay que:
--   1. Crear tu cuenta una vez desde /login (para que exista tu fila
--      en auth.users).
--   2. Buscar tu user id: Supabase Dashboard → Authentication → Users
--      (o `select id, email from auth.users;`).
--   3. Correr el backfill (reemplaza TU-UUID-AQUI):
--        UPDATE transactions    SET user_id = 'TU-UUID-AQUI' WHERE user_id IS NULL;
--        UPDATE broker_fundings SET user_id = 'TU-UUID-AQUI' WHERE user_id IS NULL;
--   4. Solo entonces correr la migración 006.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE transactions    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE broker_fundings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_transactions_user_id    ON transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_broker_fundings_user_id ON broker_fundings (user_id);
