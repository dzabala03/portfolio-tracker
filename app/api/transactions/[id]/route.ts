// DELETE /api/transactions/:id

import { NextRequest, NextResponse } from "next/server";
import { deleteTransaction } from "@/lib/supabase/client";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await deleteTransaction(params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/transactions/:id]", error);
    return NextResponse.json(
      { error: "Error eliminando transacción" },
      { status: 500 }
    );
  }
}
