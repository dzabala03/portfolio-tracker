"use client";

import { useState } from "react";
import type { FeeCurrency } from "@/types";
import { Loader2 } from "lucide-react";

interface Props {
  onSuccess?: () => void;
}

const BROKER_METHODS = ["ARQ", "Global66", "Wise", "Payoneer", "Lulo Bank", "Transferencia bancaria", "Otro"];

const EMPTY_FORM = {
  brokerMethod: BROKER_METHODS[0],
  brokerMethodOther: "",
  trm: "",
  usdAmount: "",
  feeAmount: "",
  feeCurrency: "USD" as FeeCurrency,
  date: new Date().toISOString().split("T")[0],
  notes: "",
  includeInPortfolio: true,
};

export function BrokerFundingForm({ onSuccess }: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError(null);
    setSuccess(false);
  }

  const trmNum = Number(form.trm) || 0;
  const feeAmountNum = Number(form.feeAmount) || 0;
  const feeUsdPreview = form.feeCurrency === "USD" ? feeAmountNum : (trmNum > 0 ? feeAmountNum / trmNum : 0);
  const feeCopPreview = form.feeCurrency === "COP" ? feeAmountNum : feeAmountNum * trmNum;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const brokerMethod = form.brokerMethod === "Otro"
      ? (form.brokerMethodOther.trim() || "Otro")
      : form.brokerMethod;

    const payload = {
      broker_method: brokerMethod,
      trm: trmNum,
      usd_amount: Number(form.usdAmount) || 0,
      fee_amount: feeAmountNum,
      fee_currency: form.feeCurrency,
      date: form.date,
      notes: form.notes?.trim() || undefined,
      include_in_portfolio: form.includeInPortfolio,
    };

    try {
      const res = await fetch("/api/broker-fundings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Error desconocido");
      }

      setForm(EMPTY_FORM);
      setSuccess(true);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {/* Método */}
      <div className="field">
        <label htmlFor="brokerMethod">Método de fondeo</label>
        <select
          id="brokerMethod"
          name="brokerMethod"
          value={form.brokerMethod}
          onChange={handleChange}
          className="input"
        >
          {BROKER_METHODS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {form.brokerMethod === "Otro" && (
        <div className="field">
          <label htmlFor="brokerMethodOther">¿Cuál?</label>
          <input
            id="brokerMethodOther"
            name="brokerMethodOther"
            type="text"
            required
            placeholder="Nombre del intermediario"
            value={form.brokerMethodOther}
            onChange={handleChange}
            className="input"
          />
        </div>
      )}

      {/* TRM + Monto USD */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
        <div className="field">
          <label htmlFor="trm">TRM usada</label>
          <input
            id="trm" name="trm" type="number" required min="0.01" step="any"
            placeholder="3987.50" value={form.trm} onChange={handleChange} className="input"
          />
        </div>
        <div className="field">
          <label htmlFor="usdAmount">Dólares enviados (USD)</label>
          <input
            id="usdAmount" name="usdAmount" type="number" required min="0.01" step="any"
            placeholder="500.00" value={form.usdAmount} onChange={handleChange} className="input"
          />
        </div>
      </div>

      {/* Comisión + moneda */}
      <div className="field">
        <label htmlFor="feeAmount">Comisión</label>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <input
            id="feeAmount" name="feeAmount" type="number" min="0" step="any"
            placeholder="0.00" value={form.feeAmount} onChange={handleChange} className="input"
            style={{ flex: 1 }}
          />
          <div className="seg" style={{ flex: "none" }}>
            {(["USD", "COP"] as FeeCurrency[]).map((c) => (
              <label key={c} className="seg-opt">
                <input
                  type="radio" name="feeCurrency" checked={form.feeCurrency === c}
                  onChange={() => setForm((p) => ({ ...p, feeCurrency: c }))}
                />
                <span>{c}</span>
              </label>
            ))}
          </div>
        </div>
        {feeAmountNum > 0 && trmNum > 0 && (
          <p className="text-muted" style={{ fontSize: 12, margin: "5px 0 0" }}>
            Equivale a {form.feeCurrency === "USD"
              ? `$${feeCopPreview.toLocaleString("es-CO", { maximumFractionDigits: 0 })} COP`
              : `$${feeUsdPreview.toLocaleString("en-US", { maximumFractionDigits: 2 })} USD`}
          </p>
        )}
      </div>

      {/* Fecha */}
      <div className="field">
        <label htmlFor="date">Fecha</label>
        <input
          id="date" name="date" type="date" required
          value={form.date} onChange={handleChange} className="input"
        />
      </div>

      {/* Incluir en portafolio USD */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label className="switch">
          <input
            type="checkbox"
            checked={form.includeInPortfolio}
            onChange={(e) => setForm((p) => ({ ...p, includeInPortfolio: e.target.checked }))}
          />
          <span className="track" aria-hidden="true"></span>
          ¿Incluir esta transacción en el portafolio USD?
        </label>
        <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
          {form.includeInPortfolio
            ? "Se creará un depósito en USD y aumentará el efectivo disponible del portafolio."
            : "No se creará depósito en USD — usa esto para registrar fondeos históricos cuyo efectivo ya está contabilizado por otra vía, sin inflar el portafolio."}
        </p>
      </div>

      {/* Notas */}
      <div className="field">
        <label htmlFor="notes">Notas (opcional)</label>
        <textarea
          id="notes" name="notes" rows={2} placeholder="Descripción opcional..."
          value={form.notes} onChange={handleChange} className="input" style={{ resize: "none" }}
        />
      </div>

      {/* Resumen */}
      {trmNum > 0 && Number(form.usdAmount) > 0 && (
        <div className="card" style={{ gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span className="text-muted" style={{ fontSize: 12 }}>Total en pesos enviados</span>
            <span className="num" style={{ fontWeight: 600 }}>
              ${(Number(form.usdAmount) * trmNum).toLocaleString("es-CO", { maximumFractionDigits: 0 })} COP
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span className="text-muted" style={{ fontSize: 12 }}>Se acreditará como depósito de</span>
            <span className="num" style={{ fontWeight: 600 }}>
              ${Number(form.usdAmount).toLocaleString("en-US", { maximumFractionDigits: 2 })} USD
            </span>
          </div>
        </div>
      )}

      {/* Feedback */}
      {error && (
        <p role="alert" className="tag tag-loss" style={{ fontSize: 13, padding: "8px 12px", width: "100%" }}>
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="tag tag-gain" style={{ fontSize: 13, padding: "8px 12px", width: "100%" }}>
          Fondeo guardado correctamente.
        </p>
      )}

      <button type="submit" disabled={isSubmitting} className="btn btn-primary btn-block">
        {isSubmitting && <Loader2 size={14} className="animate-spin" />}
        {isSubmitting ? "Guardando..." : "Guardar fondeo"}
      </button>
    </form>
  );
}
