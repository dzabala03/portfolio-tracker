"use client";

import { useState, useEffect } from "react";
import { clsx } from "clsx";

interface IndexData {
  key: string;
  label: string;
  price?: number;
  change?: number;
  changePct?: number;
  time?: number;
  timezone?: string;
  timezoneName?: string;
  error: boolean;
}

function formatTime(time: number, timezoneName: string, timezone: string): string {
  const time12 = new Intl.DateTimeFormat("en-US", {
    timeZone: timezoneName,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(new Date(time * 1000));
  return `${time12} ${timezone}`;
}

export function MarketIndices() {
  const [indices, setIndices] = useState<IndexData[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/market-indices");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setIndices(json.indices);
      } catch (err) {
        console.error("[MarketIndices]", err);
      }
    }

    load();
    const interval = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="layout">
      <div className="kicker" style={{ marginBottom: "var(--space-2)" }}>Mercados</div>
      <div className="market-indices">
        {(indices ?? Array.from({ length: 5 })).map((idx: any, i) => {
          if (!indices) {
            return <div key={i} className="card market-index-card" style={{ opacity: 0.4 }} />;
          }
          const data = idx as IndexData;
          if (data.error || data.price === undefined) {
            return (
              <div key={data.key} className="card market-index-card">
                <span className="card-kicker">{data.label}</span>
                <span className="text-muted" style={{ fontSize: 12 }}>Sin datos</span>
              </div>
            );
          }
          const up = data.change! >= 0;
          return (
            <div key={data.key} className="card market-index-card">
              <span className="card-kicker">{data.label}</span>
              <span className="num" style={{ fontSize: 20, fontWeight: 600 }}>
                {data.price!.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className={clsx("num", up ? "gain" : "loss")} style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
                {up ? "▲" : "▼"}
                {up ? "+" : ""}{data.change!.toFixed(2)}
                {" "}({up ? "+" : ""}{data.changePct!.toFixed(2)}%)
              </span>
              {data.time && (
                <span className="text-muted" style={{ fontSize: 10, letterSpacing: ".03em" }}>
                  LAST | {formatTime(data.time, data.timezoneName!, data.timezone!)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
