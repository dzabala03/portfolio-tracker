"use client";

import { useState } from "react";
import type { NewTransaction, TransactionType } from "@/types";
import { Loader2 } from "lucide-react";

interface Props {
  onSuccess?: () => void;
}

const TYPE_OPTIONS: { value: TransactionType; label: string }[] = [
  { value: "BUY", label: "Compra" },
  { value: "SELL", label: "Venta" },
  { value: "DIVIDEND", label: "Dividendo" },
  { value: "DEPOSIT", label: "Depósito" },
  { value: "WITHDRAWAL", label: "Retiro" },
  { value: "INTEREST", label: "Interés" },
  { value: "FEE", label: "Comisión / impuesto" },
];

const TRADE_TYPES: TransactionType[] = ["BUY", "SELL"];
const CASH_ONLY_TYPES: TransactionType[] = ["DEPOSIT", "WITHDRAWAL", "INTEREST", "FEE"];

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

  const isTrade = TRADE_TYPES.includes(form.type as TransactionType);
  const isCashOnly = CASH_ONLY_TYPES.includes(form.type as TransactionType);
  const isDividend = form.type === "DIVIDEND";
  const showTicker = isTrade || isDividend;

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError(null);
    setSuccess(false);
  }

  function handleTypeChange(type: TransactionType) {
    setForm((prev) => ({ ...prev, type, shares: TRADE_TYPES.includes(type) ? prev.shares : 0 }));
    setError(null);
    setSuccess(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const payload: NewTransaction = {
      ticker: (isCashOnly ? "CASH" : form.ticker).toUpperCase().trim(),
      type: form.type as TransactionType,
      shares: isTrade ? Number(form.shares) : 0,
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

      setForm({ ...EMPTY_FORM, type: form.type }); // conserva el tipo elegido, útil si vas a registrar varios seguidos
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
      {/* Tipo */}
      <div className="field">
        <label htmlFor="type">Tipo</label>
        <select
          id="type"
          name="type"
          value={form.type}
          onChange={(e) => handleTypeChange(e.target.value as TransactionType)}
          className="input"
        >
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Ticker — solo compra/venta/dividendo */}
      {showTicker && (
        <div className="field">
          <label htmlFor="ticker">Ticker{isDividend ? " (acción que pagó el dividendo)" : ""}</label>
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
      )}

      {/* Acciones + Precio (trades) — Monto (dividendo / efectivo) */}
      {isTrade ? (
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
            <label htmlFor="price">Precio por acción (USD)</label>
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
      ) : (
        <div className="field">
          <label htmlFor="price">Monto (USD)</label>
          <input
            id="price"
            name="price"
            type="number"
            required
            min="0"
            step="any"
            placeholder="100.00"
            value={form.price || ""}
            onChange={handleChange}
            className="input"
          />
        </div>
      )}

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

      {/* Total calculado — solo tiene sentido en compra/venta */}
      {isTrade && form.shares > 0 && form.price > 0 && (
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
