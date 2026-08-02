// ─────────────────────────────────────────────────────────────
// SUPABASE — cliente admin (service role, salta RLS)
//
// SOLO para el cron de alertas (/api/cron/check-alerts). Ese endpoint
// no tiene sesión de usuario (lo dispara Vercel, no un navegador) y
// necesita ver las alertas de TODOS los usuarios en una sola pasada,
// además de leer el email de cada uno vía el Admin API de Auth.
//
// Nunca usar este cliente en una ruta que responda a un request de
// un usuario — para eso está lib/supabase/server.ts (RLS-scoped).
// ─────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

export function createAdminSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY!;

  if (!serviceRoleKey) {
    throw new Error("[Supabase] Falta SUPABASE_SECRET_KEY en .env.local — necesaria para el cron de alertas.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
