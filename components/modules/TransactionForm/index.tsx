"use client";

import { useState } from "react";
import type { NewTransaction, TransactionType } from "@/types";
import { Loader2 } from "lucide-react";

interface Props {
  onSuccess?: () => void;
}

const EMPTY_FORM: Omit<NewTransaction, "fees"> & { fees: string } = {
  ticker: "",
  type: "BUY",
  shares: 0,
  price: 0,
  date: new Date().toISOString().split("T")[0],
  fees: "",
  notes: "",
};

export function TransactionForm({ onSuccess }: Props) {
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const payload: NewTransaction = {
      ticker: form.ticker.toUpperCase().trim(),
      type: form.type as TransactionType,
      shares: Number(form.shares),
      price: Number(form.price),
      date: form.date,
      fees: form.fees === "" ? 0 : Number(form.fees),
      notes: form.notes?.trim() || undefined,
    };

    try {
      const res = await fetch("/api/transactions", {
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
      {/* Tipo: BUY / SELL */}
      <div className="field">
        <label>Tipo</label>
        <div className="seg" style={{ display: "flex", width: "100%" }}>
          {(["BUY", "SELL"] as TransactionType[]).map((t) => (
            <label key={t} className="seg-opt" style={{ flex: 1, justifyContent: "center" }}>
              <input
                type="radio"
                name="type"
                checked={form.type === t}
                onChange={() => setForm((p) => ({ ...p, type: t }))}
              />
              <span>{t === "BUY" ? "Compra" : "Venta"}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Ticker */}
      <div className="field">
        <label htmlFor="ticker">Ticker</label>
        <input
          id="ticker"
          name="ticker"
          type="text"
          required
          placeholder="AAPL"
          value={form.ticker}
          onChange={handleChange}
          className="input"
          style={{ textTransform: "uppercase" }}
          maxLength={10}
          aria-describedby="ticker-hint"
        />
        <p id="ticker-hint" className="text-muted" style={{ fontSize: 12, margin: "5px 0 0" }}>
          Símbolo de NYSE / NASDAQ
        </p>
      </div>

      {/* Acciones + Precio */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
        <div className="field">
          <label htmlFor="shares">Acciones</label>
          <input
            id="shares"
            name="shares"
            type="number"
            required
            min="0.000001"
            step="any"
            placeholder="10"
            value={form.shares || ""}
            onChange={handleChange}
            className="input"
          />
        </div>
        <div className="field">
          <label htmlFor="price">Precio (USD)</label>
          <input
            id="price"
            name="price"
            type="number"
            required
            min="0.0001"
            step="any"
            placeholder="185.50"
            value={form.price || ""}
            onChange={handleChange}
            className="input"
          />
        </div>
      </div>

      {/* Fecha + Comisiones */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
        <div className="field">
          <label htmlFor="date">Fecha</label>
          <input
            id="date"
            name="date"
            type="date"
            required
            value={form.date}
            onChange={handleChange}
            className="input"
          />
        </div>
        <div className="field">
          <label htmlFor="fees">Comisiones (USD)</label>
          <input
            id="fees"
            name="fees"
            type="number"
            min="0"
            step="any"
            placeholder="0.00"
            value={form.fees}
            onChange={handleChange}
            className="input"
          />
        </div>
      </div>

      {/* Notas */}
      <div className="field">
        <label htmlFor="notes">Notas (opcional)</label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          placeholder="Descripción opcional..."
          value={form.notes}
          onChange={handleChange}
          className="input"
          style={{ resize: "none" }}
        />
      </div>

      {/* Total calculado */}
      {form.shares > 0 && form.price > 0 && (
        <div className="card" style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <span className="text-muted" style={{ fontSize: 12 }}>Total operación</span>
          <span className="num" style={{ fontWeight: 600, fontSize: 15 }}>
            {(Number(form.shares) * Number(form.price) + Number(form.fees || 0)).toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
            })}
          </span>
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
          Transacción guardada correctamente.
        </p>
      )}

      <button type="submit" disabled={isSubmitting} className="btn btn-primary btn-block">
        {isSubmitting && <Loader2 size={14} className="animate-spin" />}
        {isSubmitting ? "Guardando..." : "Guardar transacción"}
      </button>
    </form>
  );
}
