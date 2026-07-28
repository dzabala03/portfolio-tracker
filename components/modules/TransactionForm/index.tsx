"use client";

import { useState } from "react";
import type { NewTransaction, TransactionType } from "@/types";
import { clsx } from "clsx";
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
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {/* Tipo: BUY / SELL */}
      <div>
        <label className="label block mb-2">Tipo</label>
        <div className="flex gap-2">
          {(["BUY", "SELL"] as TransactionType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setForm((p) => ({ ...p, type: t }))}
              className={clsx(
                "flex-1 py-2 text-sm font-semibold rounded-lg border transition-colors",
                form.type === t
                  ? t === "BUY"
                    ? "bg-gain-subtle border-gain text-gain"
                    : "bg-loss-subtle border-loss text-loss"
                  : "border-border text-text-muted hover:border-border hover:text-text-secondary"
              )}
            >
              {t === "BUY" ? "Compra" : "Venta"}
            </button>
          ))}
        </div>
      </div>

      {/* Ticker */}
      <div>
        <label htmlFor="ticker" className="label block mb-2">
          Ticker
        </label>
        <input
          id="ticker"
          name="ticker"
          type="text"
          required
          placeholder="AAPL"
          value={form.ticker}
          onChange={handleChange}
          className="input w-full uppercase"
          maxLength={10}
          aria-describedby="ticker-hint"
        />
        <p id="ticker-hint" className="text-text-muted text-xs mt-1">
          Símbolo de NYSE / NASDAQ
        </p>
      </div>

      {/* Acciones + Precio — en fila */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="shares" className="label block mb-2">
            Acciones
          </label>
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
            className="input w-full"
          />
        </div>
        <div>
          <label htmlFor="price" className="label block mb-2">
            Precio (USD)
          </label>
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
            className="input w-full"
          />
        </div>
      </div>

      {/* Fecha + Comisiones — en fila */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="date" className="label block mb-2">
            Fecha
          </label>
          <input
            id="date"
            name="date"
            type="date"
            required
            value={form.date}
            onChange={handleChange}
            className="input w-full"
          />
        </div>
        <div>
          <label htmlFor="fees" className="label block mb-2">
            Comisiones (USD)
          </label>
          <input
            id="fees"
            name="fees"
            type="number"
            min="0"
            step="any"
            placeholder="0.00"
            value={form.fees}
            onChange={handleChange}
            className="input w-full"
          />
        </div>
      </div>

      {/* Notas */}
      <div>
        <label htmlFor="notes" className="label block mb-2">
          Notas (opcional)
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          placeholder="Descripción opcional..."
          value={form.notes}
          onChange={handleChange}
          className="input w-full resize-none"
        />
      </div>

      {/* Total calculado */}
      {form.shares > 0 && form.price > 0 && (
        <div className="bg-elevated rounded-lg px-4 py-3 flex justify-between items-center">
          <span className="text-text-secondary text-xs">Total operación</span>
          <span className="font-finance text-text-primary font-semibold">
            ${(Number(form.shares) * Number(form.price) + Number(form.fees || 0)).toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </span>
        </div>
      )}

      {/* Feedback */}
      {error && (
        <p role="alert" className="text-loss text-sm bg-loss-subtle rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="text-gain text-sm bg-gain-subtle rounded-lg px-3 py-2">
          Transacción guardada correctamente.
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        {isSubmitting && <Loader2 size={14} className="animate-spin" />}
        {isSubmitting ? "Guardando..." : "Guardar transacción"}
      </button>
    </form>
  );
}
