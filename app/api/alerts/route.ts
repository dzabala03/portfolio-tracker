// GET  /api/alerts → alertas de precio del usuario (acciones + TRM)
// POST /api/alerts → crea una alerta

import { NextRequest, NextResponse } from "next/server";
import { fetchPriceAlerts, insertPriceAlert } from "@/lib/supabase/client";
import { requireUser } from "@/lib/supabase/server";
import type { NewPriceAlert, AlertKind, AlertDirection } from "@/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID_KINDS: AlertKind[] = ["stock", "trm"];
const VALID_DIRECTIONS: AlertDirection[] = ["above", "below"];

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const alerts = await fetchPriceAlerts(supabase);
    return NextResponse.json(alerts);
  } catch (error) {
    console.error("[GET /api/alerts]", error);
    return NextResponse.json({ error: "Error obteniendo alertas" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const body: NewPriceAlert = await request.json();

    if (!VALID_KINDS.includes(body.kind)) {
      return NextResponse.json({ error: `kind inválido. Valores permitidos: ${VALID_KINDS.join(", ")}` }, { status: 400 });
    }
    if (!VALID_DIRECTIONS.includes(body.direction)) {
      return NextResponse.json({ error: `direction inválido. Valores permitidos: ${VALID_DIRECTIONS.join(", ")}` }, { status: 400 });
    }
    if (body.kind === "stock" && !body.ticker?.trim()) {
      return NextResponse.json({ error: "ticker requerido para alertas de acciones" }, { status: 400 });
    }
    if (!body.threshold || body.threshold <= 0) {
      return NextResponse.json({ error: "threshold debe ser mayor a 0" }, { status: 400 });
    }

    const alert = await insertPriceAlert(supabase, {
      kind: body.kind,
      ticker: body.kind === "stock" ? body.ticker!.trim().toUpperCase() : null,
      direction: body.direction,
      threshold: body.threshold,
    });

    return NextResponse.json(alert, { status: 201 });
  } catch (error) {
    console.error("[POST /api/alerts]", error);
    return NextResponse.json({ error: "Error guardando la alerta" }, { status: 500 });
  }
}
