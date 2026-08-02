"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, Loader2, Trash2 } from "lucide-react";
import type { PriceAlert, AlertDirection, AlertKind } from "@/types";

interface Props {
  kind: AlertKind;
  ticker?: string; // requerido si kind === "stock"
}

function formatThreshold(value: number, kind: AlertKind): string {
  if (kind === "trm") return `$${Math.round(value).toLocaleString("es-CO")} COP`;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PriceAlertsPanel({ kind, ticker }: Props) {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [direction, setDirection] = useState<AlertDirection>("above");
  const [threshold, setThreshold] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/alerts");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const all: PriceAlert[] = await res.json();
      setAlerts(all.filter((a) => a.kind === kind && (kind === "trm" || a.ticker === ticker)));
    } catch (err) {
      console.error("[PriceAlertsPanel]", err);
      setAlerts([]);
    } finally {
      setIsLoading(false);
    }
  }, [kind, ticker]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          ticker: kind === "stock" ? ticker : null,
          direction,
          threshold: Number(threshold),
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "Error guardando la alerta");
      }
      setThreshold("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error guardando la alerta");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/alerts/${id}`, { method: "DELETE" });
      if (res.ok) setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error("[PriceAlertsPanel] delete", err);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <p className="kicker" style={{ marginBottom: "var(--space-2)" }}>
        {kind === "trm" ? "Alertas de TRM" : "Alertas de precio"}
      </p>

      <form onSubmit={handleAdd} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as AlertDirection)}
          className="input"
          style={{ width: "auto" }}
          aria-label="Dirección de la alerta"
        >
          <option value="above">Sube por encima de</option>
          <option value="below">Baja por debajo de</option>
        </select>
        <input
          type="number" step="any" min="0" required
          placeholder={kind === "trm" ? "TRM en COP" : "Precio en USD"}
          value={threshold} onChange={(e) => setThreshold(e.target.value)}
          className="input" style={{ width: 140 }}
          aria-label="Umbral de la alerta"
        />
        <button type="submit" className="btn btn-secondary" disabled={isSaving || !threshold}>
          {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
          Crear alerta
        </button>
      </form>

      {error && (
        <p role="alert" className="tag tag-loss" style={{ fontSize: 12, marginTop: 6, padding: "6px 10px", width: "fit-content" }}>
          {error}
        </p>
      )}

      {!isLoading && alerts.length > 0 && (
        <div style={{ marginTop: "var(--space-3)", display: "flex", flexDirection: "column", gap: 4 }}>
          {alerts.map((a) => (
            <div key={a.id} className="qs-row">
              <span>
                {a.direction === "above" ? "Sube por encima de" : "Baja por debajo de"} {formatThreshold(a.threshold, kind)}
                {a.last_notified_date && (
                  <span className="text-muted" style={{ fontSize: 11, marginLeft: 6 }}>
                    (última vez avisada: {a.last_notified_date})
                  </span>
                )}
              </span>
              <button
                className="btn btn-icon btn-icon-sm"
                aria-label="Eliminar alerta"
                onClick={() => handleDelete(a.id)}
                disabled={deletingId === a.id}
              >
                {deletingId === a.id
                  ? <Loader2 size={13} className="animate-spin" />
                  : <Trash2 size={13} color="var(--color-loss)" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
