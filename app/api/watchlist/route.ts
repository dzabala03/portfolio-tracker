// GET  /api/watchlist → lista de tickers seguidos por el usuario
// POST /api/watchlist → agrega un ticker

import { NextRequest, NextResponse } from "next/server";
import { fetchWatchlist, insertWatchlistItem } from "@/lib/supabase/client";
import { requireUser } from "@/lib/supabase/server";
import type { NewWatchlistItem } from "@/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const watchlist = await fetchWatchlist(supabase);
    return NextResponse.json(watchlist);
  } catch (error) {
    console.error("[GET /api/watchlist]", error);
    return NextResponse.json({ error: "Error obteniendo watchlist" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const body: NewWatchlistItem = await request.json();
    const ticker = body.ticker?.trim().toUpperCase();
    if (!ticker) {
      return NextResponse.json({ error: "Campo requerido: ticker" }, { status: 400 });
    }

    const item = await insertWatchlistItem(supabase, ticker);
    return NextResponse.json(item, { status: 201 });
  } catch (error: any) {
    // Violación de UNIQUE (user_id, ticker) — ya estaba en la watchlist.
    if (error?.message?.includes("duplicate key")) {
      return NextResponse.json({ error: "Ese ticker ya está en tu watchlist" }, { status: 409 });
    }
    console.error("[POST /api/watchlist]", error);
    return NextResponse.json({ error: "Error agregando a la watchlist" }, { status: 500 });
  }
}
