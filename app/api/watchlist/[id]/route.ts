// DELETE /api/watchlist/:id → quita un ticker de la watchlist

import { NextRequest, NextResponse } from "next/server";
import { deleteWatchlistItem } from "@/lib/supabase/client";
import { requireUser } from "@/lib/supabase/server";

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    await deleteWatchlistItem(supabase, params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/watchlist/:id]", error);
    return NextResponse.json({ error: "Error eliminando de la watchlist" }, { status: 500 });
  }
}
