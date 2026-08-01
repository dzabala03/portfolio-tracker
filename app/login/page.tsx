"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { Loader2 } from "lucide-react";

type Step = "email" | "otp";

export default function LoginPage() {
  const router = useRouter();
  const [supabase] = useState(() => createBrowserSupabaseClient());
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
    setIsLoading(false);
    if (error) setError(error.message);
    else setStep("otp");
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp.trim(),
      type: "email",
    });
    setIsLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/");
    router.refresh();
  }

  async function handleGoogleLogin() {
    setIsGoogleLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setIsGoogleLoading(false);
    }
    // si no hay error, el navegador ya está siendo redirigido a Google
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-4)",
      }}
    >
      <div className="card elev-md" style={{ width: 360, gap: "var(--space-4)", padding: "var(--space-6)" }}>
        <div style={{ textAlign: "center" }}>
          <div className="nav-brand" style={{ fontStyle: "italic", fontSize: 22 }}>Portfolio Tracker</div>
          <p className="text-muted" style={{ fontSize: 13, marginTop: 6 }}>
            Inicia sesión para ver tu portafolio
          </p>
        </div>

        <button
          type="button"
          className="btn btn-secondary btn-block"
          onClick={handleGoogleLogin}
          disabled={isGoogleLoading}
          style={{ marginTop: 0 }}
        >
          {isGoogleLoading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.67-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
          )}
          Continuar con Google
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
          <span className="text-muted" style={{ fontSize: 11 }}>o con correo</span>
          <div style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
        </div>

        {step === "email" ? (
          <form onSubmit={handleSendOtp} noValidate style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <div className="field">
              <label htmlFor="email">Correo electrónico</label>
              <input
                id="email" name="email" type="email" required autoFocus
                placeholder="tu@correo.com" value={email}
                onChange={(e) => setEmail(e.target.value)} className="input"
              />
            </div>
            <button type="submit" disabled={isLoading || !email} className="btn btn-primary btn-block" style={{ marginTop: 0 }}>
              {isLoading && <Loader2 size={14} className="animate-spin" />}
              {isLoading ? "Enviando..." : "Enviar código"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} noValidate style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
              Enviamos un código de 6 dígitos a <strong>{email}</strong>.
            </p>
            <div className="field">
              <label htmlFor="otp">Código</label>
              <input
                id="otp" name="otp" type="text" inputMode="numeric" required autoFocus
                placeholder="123456" value={otp} maxLength={6}
                onChange={(e) => setOtp(e.target.value)} className="input"
              />
            </div>
            <button type="submit" disabled={isLoading || otp.length < 6} className="btn btn-primary btn-block" style={{ marginTop: 0 }}>
              {isLoading && <Loader2 size={14} className="animate-spin" />}
              {isLoading ? "Verificando..." : "Verificar e ingresar"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: 12 }}
              onClick={() => { setStep("email"); setOtp(""); setError(null); }}
            >
              Usar otro correo
            </button>
          </form>
        )}

        {error && (
          <p role="alert" className="tag tag-loss" style={{ fontSize: 12, padding: "8px 12px", width: "100%" }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
