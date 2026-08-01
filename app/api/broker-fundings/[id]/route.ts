// DELETE /api/broker-fundings/:id → elimina un fondeo (y su DEPOSIT vinculado, si lo tiene)

import { NextRequest, NextResponse } from "next/server";
import { deleteBrokerFunding } from "@/lib/supabase/client";
import { requireUser } from "@/lib/supabase/server";

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    await deleteBrokerFunding(supabase, params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/broker-fundings/:id]", error);
    return NextResponse.json({ error: "Error eliminando fondeo" }, { status: 500 });
  }
}
