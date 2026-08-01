-- ─────────────────────────────────────────────────────────────
-- MIGRACIÓN 004 — Fondeos opcionalmente fuera del portafolio USD
-- Ejecutar en: Supabase Dashboard → SQL Editor
--
-- Un fondeo histórico (que se está registrando solo para llevar el
-- detalle en pesos, pero cuyo efectivo YA fue contabilizado antes por
-- otra vía) no debe crear un DEPOSIT — si no, el efectivo disponible
-- del portafolio en USD queda inflado. `transaction_id` pasa a ser
-- opcional: NULL significa "este fondeo no está incluido en el
-- portafolio USD".
-- ─────────────────────────────────────────────────────────────

ALTER TABLE broker_fundings ALTER COLUMN transaction_id DROP NOT NULL;

COMMENT ON COLUMN broker_fundings.transaction_id IS
  'NULL = este fondeo no crea/tiene un DEPOSIT en transactions (no cuenta para el efectivo/rendimiento en USD) — se marcó así al registrarlo para no inflar el portafolio con historial ya contabilizado.';
