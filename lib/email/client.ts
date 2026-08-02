// ─────────────────────────────────────────────────────────────
// RESEND — envío de correos de alerta (precio de acciones / TRM)
// Plan gratis: 3,000 correos/mes, 100/día. Se envía desde el dominio
// compartido de Resend (onboarding@resend.dev) — no requiere verificar
// un dominio propio para empezar.
// ─────────────────────────────────────────────────────────────

import { Resend } from "resend";

function getResendClient(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      "[Resend] Falta RESEND_API_KEY en .env.local. Regístrate gratis en https://resend.com"
    );
  }
  return new Resend(key);
}

const FROM = "Portfolio Tracker <onboarding@resend.dev>";

export async function sendAlertEmail(to: string, subject: string, html: string): Promise<void> {
  const resend = getResendClient();
  const { error } = await resend.emails.send({ from: FROM, to, subject, html });
  if (error) {
    throw new Error(`[Resend] sendAlertEmail: ${error.message}`);
  }
}
