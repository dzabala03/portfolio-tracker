// GET  /api/transactions       → todas las transacciones
// POST /api/transactions       → insertar transacción
// DELETE /api/transactions/:id → eliminar (ver [id]/route.ts)

import { NextRequest, NextResponse } from "next/server";
import {
  fetchAllTransactions,
  insertTransaction,
} from "@/lib/supabase/client";
import { requireUser } from "@/lib/supabase/server";
import { TRADING_TYPES, CASH_TYPES, type NewTransaction } from "@/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const transactions = await fetchAllTransactions(supabase);
    return NextResponse.json(transactions);
  } catch (error) {
    console.error("[GET /api/transactions]", error);
    return NextResponse.json(
      { error: "Error obteniendo transacciones" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const body: NewTransaction = await request.json();

    // Validación básica
    const required: (keyof NewTransaction)[] = [
      "ticker",
      "type",
      "shares",
      "price",
      "date",
    ];
    for (const field of required) {
      if (body[field] === undefined || body[field] === null || body[field] === "") {
        return NextResponse.json(
          { error: `Campo requerido: ${field}` },
          { status: 400 }
        );
      }
    }

    const VALID_TYPES = [...TRADING_TYPES, ...CASH_TYPES];
    if (!VALID_TYPES.includes(body.type)) {
      return NextResponse.json(
        { error: `type inválido. Valores permitidos: ${VALID_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    // Los movimientos de efectivo no tienen acciones: shares = 0 y price = monto total
    const isTrade = TRADING_TYPES.includes(body.type);

    if (isTrade && body.shares <= 0) {
      return NextResponse.json(
        { error: "shares debe ser mayor a 0 en BUY/SELL" },
        { status: 400 }
      );
    }

    if (isTrade && body.price <= 0) {
      return NextResponse.json(
        { error: "price debe ser mayor a 0 en BUY/SELL" },
        { status: 400 }
      );
    }

    if (!isTrade && body.price < 0) {
      return NextResponse.json(
        { error: "el monto (price) no puede ser negativo" },
        { status: 400 }
      );
    }

    const tx = await insertTransaction(supabase, {
      ...body,
      ticker: body.ticker.toUpperCase(),
      shares: isTrade ? body.shares : 0,
      fees: body.fees ?? 0,
    });

    return NextResponse.json(tx, { status: 201 });
  } catch (error) {
    console.error("[POST /api/transactions]", error);
    return NextResponse.json(
      { error: "Error guardando transacción" },
      { status: 500 }
    );
  }
}
