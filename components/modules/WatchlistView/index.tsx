"use client";

import { useState, useEffect, useCallback } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { formatCurrency } from "@/lib/finance/calculations";
import type { WatchlistItem } from "@/types";

interface Quote {
  ticker: string;
  currentPrice: number;
  change: number;
  changePct: number;
}

interface Props {
  onSelectTicker: (ticker: string) => void;
}

export function WatchlistView({ onSelectTicker }: Props) {
  const [items, setItems] = useState<WatchlistItem[] | null>(null);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/watchlist");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: WatchlistItem[] = await res.json();
      setItems(json);

      if (json.length > 0) {
        const tickers = json.map((i) => i.ticker).join(",");
        const qRes = await fetch(`/api/prices?tickers=${encodeURIComponent(tickers)}`);
        if (qRes.ok) setQuotes(await qRes.json());
      }
    } catch (err) {
      console.error("[WatchlistView]", err);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRemove(id: string) {
    setRemovingId(id);
    try {
      const res = await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
      if (res.ok) setItems((prev) => prev?.filter((i) => i.id !== id) ?? null);
    } catch (err) {
      console.error("[WatchlistView] remove", err);
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="layout">
      <div className="row-hd">
        <h3 style={{ margin: 0 }}>Watchlist</h3>
      </div>

      {isLoading && <div className="empty-note">Cargando…</div>}

      {!isLoading && items && items.length === 0 && (
        <div className="empty-note">
          Sin acciones en seguimiento todavía — búscalas con la barra de arriba y agrégalas
          desde el botón de la ficha de detalle.
        </div>
      )}

      {!isLoading && items && items.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Activo</th>
              <th className="num">Precio</th>
              <th className="num">Cambio</th>
              <th style={{ width: 36 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const q = quotes[item.ticker];
              const up = (q?.change ?? 0) >= 0;
              return (
                <tr key={item.id}>
                  <td>
                    <button
                      type="button"
                      onClick={() => onSelectTicker(item.ticker)}
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", color: "inherit" }}
                    >
                      <strong style={{ textDecoration: "underline", textDecorationColor: "var(--color-divider)" }}>
                        {item.ticker}
                      </strong>
                    </button>
                  </td>
                  <td className="num">{q ? formatCurrency(q.currentPrice) : "—"}</td>
                  <td className={clsx("num", q && (up ? "gain" : "loss"))}>
                    {q ? `${up ? "+" : ""}${formatCurrency(q.change)} (${up ? "+" : ""}${q.changePct.toFixed(2)}%)` : "—"}
                  </td>
                  <td>
                    <button
                      className="btn btn-icon btn-icon-sm"
                      aria-label="Quitar de watchlist"
                      onClick={() => handleRemove(item.id)}
                      disabled={removingId === item.id}
                    >
                      {removingId === item.id
                        ? <Loader2 size={14} className="animate-spin" />
                        : <Trash2 size={14} color="var(--color-loss)" />}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
