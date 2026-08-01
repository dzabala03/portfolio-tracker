// DELETE /api/transactions/:id

import { NextRequest, NextResponse } from "next/server";
import { deleteTransaction } from "@/lib/supabase/client";
import { requireUser } from "@/lib/supabase/server";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    await deleteTransaction(supabase, params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/transactions/:id]", error);
    return NextResponse.json(
      { error: "Error eliminando transacción" },
      { status: 500 }
    );
  }
}
