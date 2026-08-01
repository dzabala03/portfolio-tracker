// ─────────────────────────────────────────────────────────────
// SUPABASE — cliente de navegador (componentes "use client")
// Usa cookies (no localStorage) para que la sesión la pueda leer
// también el servidor — necesario para el patrón de Next.js SSR.
// ─────────────────────────────────────────────────────────────

import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export function createBrowserSupabaseClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
