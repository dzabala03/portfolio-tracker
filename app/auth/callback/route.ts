// GET /auth/callback — recibe el código del flujo OAuth (Google) y lo
// intercambia por una sesión (cookies). El login por email OTP no pasa
// por aquí: se verifica directo en /login con verifyOtp().

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("[auth/callback] exchangeCodeForSession:", error.message);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
