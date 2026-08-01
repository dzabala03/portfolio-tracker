// GET /api/trm — TRM oficial de Colombia (Superintendencia Financiera)

import { NextResponse } from "next/server";
import { fetchTRM } from "@/lib/trm/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const trm = await fetchTRM();
    return NextResponse.json(trm);
  } catch (error) {
    console.error("[GET /api/trm]", error);
    return NextResponse.json({ error: "Error obteniendo la TRM" }, { status: 500 });
  }
}
