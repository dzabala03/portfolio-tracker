"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { Trash2, Loader2, ChevronDown, ChevronRight, Bell } from "lucide-react";
import { clsx } from "clsx";
import { formatCurrency } from "@/lib/finance/calculations";
import type { WatchlistItem, PriceAlert } from "@/types";

function formatThreshold(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [res, alertsRes] = await Promise.all([
        fetch("/api/watchlist"),
        fetch("/api/alerts"),
      ]);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: WatchlistItem[] = await res.json();
      setItems(json);
      setAlerts(alertsRes.ok ? await alertsRes.json() : []);

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

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
              <th style={{ width: 20 }}></th>
              <th>Activo</th>
              <th className="num">Precio</th>
              <th className="num">Cambio</th>
              <th className="num">Alertas</th>
              <th style={{ width: 36 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const q = quotes[item.ticker];
              const up = (q?.change ?? 0) >= 0;
              const tickerAlerts = alerts.filter((a) => a.kind === "stock" && a.ticker === item.ticker);
              const isExpanded = expanded.has(item.id);
              return (
                <Fragment key={item.id}>
                  <tr>
                    <td>
                      {tickerAlerts.length > 0 && (
                        <button
                          type="button"
                          className="btn btn-icon btn-icon-sm"
                          aria-label={isExpanded ? "Ocultar alertas" : "Ver alertas"}
                          onClick={() => toggleExpanded(item.id)}
                        >
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      )}
                    </td>
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
                    <td className="num">
                      {tickerAlerts.length > 0 ? (
                        <button
                          type="button"
                          className="tag tag-accent"
                          style={{ cursor: "pointer", border: "none", font: "inherit" }}
                          onClick={() => toggleExpanded(item.id)}
                        >
                          <Bell size={11} style={{ marginRight: 4 }} />
                          {tickerAlerts.length}
                        </button>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
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
                  {isExpanded && tickerAlerts.length > 0 && (
                    <tr>
                      <td></td>
                      <td colSpan={5} style={{ paddingTop: 0, paddingBottom: "var(--space-3)" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {tickerAlerts.map((a) => (
                            <div key={a.id} className="qs-row" style={{ padding: "4px 0" }}>
                              <span className="text-muted">
                                {a.direction === "above" ? "Sube por encima de" : "Baja por debajo de"} {formatThreshold(a.threshold)}
                              </span>
                              <span className="text-muted" style={{ fontSize: 11 }}>
                                {a.last_notified_date ? `última vez avisada: ${a.last_notified_date}` : "sin avisos todavía"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
