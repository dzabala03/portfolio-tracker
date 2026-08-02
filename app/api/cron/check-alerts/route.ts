// GET /api/cron/check-alerts
//
// Disparado una vez al día por Vercel Cron (ver vercel.json). Revisa
// TODAS las alertas de TODOS los usuarios (por eso usa el cliente
// admin, sin sesión ni RLS) y manda un correo por cada una que cumpla
// su condición — pero solo si no se le avisó ya HOY, sin importar
// cuántas veces el precio cruce el umbral ese mismo día.
//
// Protegido con CRON_SECRET: Vercel manda automáticamente el header
// "Authorization: Bearer $CRON_SECRET" en las invocaciones de cron —
// cualquier otra llamada sin ese header se rechaza.

import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { fetchQuotes } from "@/lib/finnhub/client";
import { fetchTRM } from "@/lib/trm/client";
import { sendAlertEmail } from "@/lib/email/client";
import type { PriceAlert } from "@/types";

// La tabla SÍ tiene user_id (es dueño de la fila vía RLS) — el tipo
// compartido PriceAlert no lo declara porque el resto de la app nunca
// necesita verlo (RLS ya filtra), pero el cron sí lo necesita para
// mandar el correo a la persona correcta.
interface PriceAlertRow extends PriceAlert {
  user_id: string;
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function conditionMet(direction: PriceAlert["direction"], current: number, threshold: number): boolean {
  return direction === "above" ? current >= threshold : current <= threshold;
}

function formatMoney(value: number, currency: "USD" | "COP"): string {
  if (currency === "COP") return `$${Math.round(value).toLocaleString("es-CO")} COP`;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildEmailHtml(opts: {
  title: string;
  currentLabel: string;
  currentValue: string;
  thresholdLabel: string;
}): string {
  return `
    <div style="font-family: Georgia, serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 12px;">${opts.title}</h2>
      <p style="font-size: 15px; color: #333;">${opts.currentLabel}: <strong>${opts.currentValue}</strong></p>
      <p style="font-size: 13px; color: #666;">Alerta configurada: ${opts.thresholdLabel}</p>
      <p style="font-size: 12px; color: #999; margin-top: 24px;">Portfolio Tracker — esta alerta se revisa una vez al día y solo avisa una vez por día.</p>
    </div>
  `;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();
  const today = todayISO();

  const { data: alerts, error } = await supabase.from("price_alerts").select("*");
  if (error) {
    console.error("[cron/check-alerts] fetch alerts:", error);
    return NextResponse.json({ error: "Error obteniendo alertas" }, { status: 500 });
  }

  const pending = (alerts as PriceAlertRow[]).filter((a) => a.last_notified_date !== today);
  if (pending.length === 0) {
    return NextResponse.json({ checked: 0, notified: 0 });
  }

  const stockTickers = [...new Set(pending.filter((a) => a.kind === "stock").map((a) => a.ticker!))];
  const needsTrm = pending.some((a) => a.kind === "trm");

  const [quotes, trm] = await Promise.all([
    stockTickers.length > 0 ? fetchQuotes(stockTickers) : Promise.resolve(new Map()),
    needsTrm ? fetchTRM().catch((err) => { console.error("[cron/check-alerts] TRM:", err); return null; }) : Promise.resolve(null),
  ]);

  let notified = 0;

  for (const alert of pending) {
    const currency = alert.kind === "stock" ? "USD" : "COP";
    const verb = alert.direction === "above" ? "subió por encima de" : "bajó por debajo de";
    const verbInstruction = alert.direction === "above" ? "Avisar si sube por encima de" : "Avisar si baja por debajo de";

    let current: number;
    let currentLabel: string;

    if (alert.kind === "stock") {
      const q = quotes.get(alert.ticker!.toUpperCase());
      if (!q) continue;
      current = q.currentPrice;
      currentLabel = `Precio actual de ${alert.ticker}`;
    } else {
      if (!trm) continue;
      current = trm.value;
      currentLabel = "TRM actual";
    }

    if (!conditionMet(alert.direction, current, alert.threshold)) continue;

    const currentValueStr = formatMoney(current, currency);
    const title = `${alert.kind === "stock" ? alert.ticker : "La TRM"} ${verb} ${formatMoney(alert.threshold, currency)}`;
    const thresholdLabel = `${verbInstruction} ${formatMoney(alert.threshold, currency)}`;

    try {
      const { data: userRes, error: userErr } = await supabase.auth.admin.getUserById(alert.user_id);
      const email = userRes?.user?.email;
      if (userErr || !email) {
        console.error("[cron/check-alerts] sin email para user_id", alert.user_id, userErr);
        continue;
      }

      await sendAlertEmail(
        email,
        title,
        buildEmailHtml({ title, currentLabel, currentValue: currentValueStr, thresholdLabel })
      );

      await supabase.from("price_alerts").update({ last_notified_date: today }).eq("id", alert.id);
      notified++;
    } catch (err) {
      console.error("[cron/check-alerts] alerta", alert.id, err);
    }
  }

  return NextResponse.json({ checked: pending.length, notified });
}
