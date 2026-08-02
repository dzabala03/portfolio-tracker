// ─────────────────────────────────────────────────────────────
// SUPABASE — helpers de datos (transacciones y fondeos)
// Reciben el cliente como parámetro (creado en cada Route Handler
// vía lib/supabase/server.ts, con la sesión del usuario) para que
// las políticas RLS filtren cada tabla por auth.uid() automático —
// estas funciones no conocen ni necesitan el id del usuario.
// ─────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Transaction, BrokerFunding, NewBrokerFunding, WatchlistItem, PriceAlert, NewPriceAlert } from "@/types";

// ─── Helpers de transacciones ────────────────────────────────

export async function fetchAllTransactions(supabase: SupabaseClient): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .order("date", { ascending: true });

  if (error) throw new Error(`[Supabase] fetchAllTransactions: ${error.message}`);
  return data ?? [];
}

export async function insertTransaction(
  supabase: SupabaseClient,
  tx: Omit<Transaction, "id" | "created_at">
): Promise<Transaction> {
  const { data, error } = await supabase
    .from("transactions")
    .insert(tx)
    .select()
    .single();

  if (error) throw new Error(`[Supabase] insertTransaction: ${error.message}`);
  return data;
}

export async function deleteTransaction(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) throw new Error(`[Supabase] deleteTransaction: ${error.message}`);
}

// ─── Helpers de fondeos del broker (sección Pesos COP) ────────

export async function fetchAllBrokerFundings(supabase: SupabaseClient): Promise<BrokerFunding[]> {
  const { data, error } = await supabase
    .from("broker_fundings")
    .select("*")
    .order("date", { ascending: false });

  if (error) throw new Error(`[Supabase] fetchAllBrokerFundings: ${error.message}`);
  return data ?? [];
}

// Por defecto, un fondeo viene con su depósito: primero se crea la
// transacción DEPOSIT (afecta efectivo/rendimiento en USD como
// cualquier depósito normal), luego el detalle en pesos que la
// referencia. Si el segundo insert falla, se revierte el primero —
// PostgREST no da transacciones multi-tabla vía REST.
// Si `include_in_portfolio` es false (fondeo histórico ya contabilizado
// por otra vía), no se crea el DEPOSIT y `transaction_id` queda NULL.
export async function insertBrokerFundingWithDeposit(
  supabase: SupabaseClient,
  funding: NewBrokerFunding,
  feeUsd: number,
  feeCop: number
): Promise<BrokerFunding> {
  const { include_in_portfolio, ...fundingRow } = funding;

  let transactionId: string | null = null;
  if (include_in_portfolio) {
    const depositNote = `Fondeo vía ${funding.broker_method} — TRM ${funding.trm.toFixed(2)}`;
    const transaction = await insertTransaction(supabase, {
      ticker: "CASH",
      type: "DEPOSIT",
      shares: 0,
      price: funding.usd_amount,
      fees: 0,
      date: funding.date,
      notes: funding.notes ? `${depositNote}. ${funding.notes}` : depositNote,
    });
    transactionId = transaction.id;
  }

  const { data, error } = await supabase
    .from("broker_fundings")
    .insert({ ...fundingRow, transaction_id: transactionId, fee_usd: feeUsd, fee_cop: feeCop })
    .select()
    .single();

  if (error) {
    if (transactionId) await deleteTransaction(supabase, transactionId); // revertir el depósito huérfano
    throw new Error(`[Supabase] insertBrokerFundingWithDeposit: ${error.message}`);
  }
  return data;
}

// Si el fondeo tiene un DEPOSIT vinculado, borrar la transacción hace
// cascade sobre broker_fundings (FK ON DELETE CASCADE). Si no lo tiene
// (transaction_id NULL), hay que borrar la fila directamente.
export async function deleteBrokerFunding(supabase: SupabaseClient, id: string): Promise<void> {
  const { data, error: fetchError } = await supabase
    .from("broker_fundings")
    .select("transaction_id")
    .eq("id", id)
    .single();

  if (fetchError) throw new Error(`[Supabase] deleteBrokerFunding (fetch): ${fetchError.message}`);

  if (data.transaction_id) {
    await deleteTransaction(supabase, data.transaction_id);
    return;
  }

  const { error } = await supabase.from("broker_fundings").delete().eq("id", id);
  if (error) throw new Error(`[Supabase] deleteBrokerFunding: ${error.message}`);
}

// ─── Helpers de watchlist ───────────────────────────────────────

export async function fetchWatchlist(supabase: SupabaseClient): Promise<WatchlistItem[]> {
  const { data, error } = await supabase
    .from("watchlist")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`[Supabase] fetchWatchlist: ${error.message}`);
  return data ?? [];
}

export async function insertWatchlistItem(supabase: SupabaseClient, ticker: string): Promise<WatchlistItem> {
  const { data, error } = await supabase
    .from("watchlist")
    .insert({ ticker })
    .select()
    .single();

  if (error) throw new Error(`[Supabase] insertWatchlistItem: ${error.message}`);
  return data;
}

export async function deleteWatchlistItem(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("watchlist").delete().eq("id", id);
  if (error) throw new Error(`[Supabase] deleteWatchlistItem: ${error.message}`);
}

// ─── Helpers de alertas de precio ──────────────────────────────

export async function fetchPriceAlerts(supabase: SupabaseClient): Promise<PriceAlert[]> {
  const { data, error } = await supabase
    .from("price_alerts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`[Supabase] fetchPriceAlerts: ${error.message}`);
  return data ?? [];
}

export async function insertPriceAlert(supabase: SupabaseClient, alert: NewPriceAlert): Promise<PriceAlert> {
  const { data, error } = await supabase
    .from("price_alerts")
    .insert(alert)
    .select()
    .single();

  if (error) throw new Error(`[Supabase] insertPriceAlert: ${error.message}`);
  return data;
}

export async function deletePriceAlert(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("price_alerts").delete().eq("id", id);
  if (error) throw new Error(`[Supabase] deletePriceAlert: ${error.message}`);
}
