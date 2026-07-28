// ─────────────────────────────────────────────────────────────
// SUPABASE CLIENT
// Dos instancias según el contexto:
//   - browserClient: componentes React del lado cliente
//   - serverClient: API routes (usa service role, no expuesto)
// ─────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import type { Transaction } from "@/types";

const supabaseUrl      = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey  = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const serviceRoleKey   = process.env.SUPABASE_SECRET_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "[Supabase] Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en .env.local"
  );
}

// Cliente público — solo para uso en componentes cliente si se necesita
export const browserClient = createClient(supabaseUrl, supabaseAnonKey);

// Cliente de servidor — solo en API routes, nunca en componentes cliente
// Usa service role para operaciones CRUD sin restricciones RLS
export function getServerClient() {
  if (!serviceRoleKey) {
    throw new Error(
      "[Supabase] Falta SUPABASE_SERVICE_ROLE_KEY en .env.local. Solo necesario en el servidor."
    );
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
    // Next.js parchea `fetch` y cachea los GET en la Data Cache (disco).
    // Sin esto, PostgREST devuelve para siempre el primer resultado obtenido.
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}

// ─── Helpers de transacciones ────────────────────────────────

export async function fetchAllTransactions(): Promise<Transaction[]> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .order("date", { ascending: true });

  if (error) throw new Error(`[Supabase] fetchAllTransactions: ${error.message}`);
  return data ?? [];
}

export async function insertTransaction(
  tx: Omit<Transaction, "id" | "created_at">
): Promise<Transaction> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("transactions")
    .insert(tx)
    .select()
    .single();

  if (error) throw new Error(`[Supabase] insertTransaction: ${error.message}`);
  return data;
}

export async function deleteTransaction(id: string): Promise<void> {
  const supabase = getServerClient();
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) throw new Error(`[Supabase] deleteTransaction: ${error.message}`);
}
