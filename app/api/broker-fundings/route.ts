// GET  /api/broker-fundings → historial de fondeos (para la tabla de depósitos)
// POST /api/broker-fundings → registra un fondeo + su depósito en USD

import { NextRequest, NextResponse } from "next/server";
import {
  fetchAllBrokerFundings,
  insertBrokerFundingWithDeposit,
} from "@/lib/supabase/client";
import { requireUser } from "@/lib/supabase/server";
import type { NewBrokerFunding, FeeCurrency } from "@/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const fundings = await fetchAllBrokerFundings(supabase);
    return NextResponse.json(fundings);
  } catch (error) {
    console.error("[GET /api/broker-fundings]", error);
    return NextResponse.json({ error: "Error obteniendo fondeos" }, { status: 500 });
  }
}

const VALID_FEE_CURRENCIES: FeeCurrency[] = ["USD", "COP"];

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await requireUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const body: NewBrokerFunding = await request.json();

    const required: (keyof NewBrokerFunding)[] = ["broker_method", "trm", "usd_amount", "fee_currency", "date"];
    for (const field of required) {
      if (body[field] === undefined || body[field] === null || body[field] === "") {
        return NextResponse.json({ error: `Campo requerido: ${field}` }, { status: 400 });
      }
    }

    if (!VALID_FEE_CURRENCIES.includes(body.fee_currency)) {
      return NextResponse.json(
        { error: `fee_currency inválido. Valores permitidos: ${VALID_FEE_CURRENCIES.join(", ")}` },
        { status: 400 }
      );
    }
    if (body.trm <= 0) {
      return NextResponse.json({ error: "trm debe ser mayor a 0" }, { status: 400 });
    }
    if (body.usd_amount <= 0) {
      return NextResponse.json({ error: "usd_amount debe ser mayor a 0" }, { status: 400 });
    }
    if (body.fee_amount < 0) {
      return NextResponse.json({ error: "fee_amount no puede ser negativo" }, { status: 400 });
    }

    const feeAmount = body.fee_amount ?? 0;
    const feeUsd = body.fee_currency === "USD" ? feeAmount : feeAmount / body.trm;
    const feeCop = body.fee_currency === "COP" ? feeAmount : feeAmount * body.trm;

    const funding = await insertBrokerFundingWithDeposit(
      supabase,
      {
        ...body,
        broker_method: body.broker_method.trim(),
        fee_amount: feeAmount,
        include_in_portfolio: body.include_in_portfolio ?? true,
      },
      feeUsd,
      feeCop
    );

    return NextResponse.json(funding, { status: 201 });
  } catch (error) {
    console.error("[POST /api/broker-fundings]", error);
    return NextResponse.json({ error: "Error guardando el fondeo" }, { status: 500 });
  }
}
