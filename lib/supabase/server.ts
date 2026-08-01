// ─────────────────────────────────────────────────────────────
// SUPABASE — cliente de servidor con sesión de usuario (Route Handlers)
// A diferencia del cliente con service role, este usa la ANON key +
// la sesión leída de las cookies — por eso Postgres puede resolver
// auth.uid() y las políticas RLS filtran automáticamente cada tabla
// por el usuario autenticado. Nunca usar este cliente para lógica
// que deba saltarse RLS.
// ─────────────────────────────────────────────────────────────

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export function createServerSupabaseClient() {
  const cookieStore = cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Se llama desde un Server Component (no puede escribir cookies) —
          // el middleware ya se encarga de refrescar la sesión en ese caso.
        }
      },
    },
    global: {
      // Next.js parchea `fetch` y cachea los GET en la Data Cache (disco).
      // Sin esto, PostgREST devuelve para siempre el primer resultado obtenido.
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}

// Cada Route Handler que toca datos del usuario empieza con esto —
// devuelve el cliente ya autenticado y el usuario, o `user: null` si
// no hay sesión (el caller debe responder 401 en ese caso).
export async function requireUser() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}
