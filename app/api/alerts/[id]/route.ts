// DELETE /api/alerts/:id → elimina una alerta de precio

import { NextRequest, NextResponse } from "next/server";
import { deletePriceAlert } from "@/lib/supabase/client";
import { requireUser } from "@/lib/supabase/server";

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    await deletePriceAlert(supabase, params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/alerts/:id]", error);
    return NextResponse.json({ error: "Error eliminando la alerta" }, { status: 500 });
  }
}
