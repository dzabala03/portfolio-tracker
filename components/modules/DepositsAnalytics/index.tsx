"use client";

import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { BrokerFunding } from "@/types";

interface Props {
  fundings: BrokerFunding[];
}

const COLOR_ACCENT_500 = "#38a6cf";
const COLOR_ACCENT_700 = "#006786";
const COLOR_ACCENT_800 = "#004961";
const COLOR_DIVIDER = "#e3e1e0";

type Range = "MTD" | "1M" | "3M" | "6M" | "1Y" | "YTD" | "ALL";
const RANGES: Range[] = ["MTD", "1M", "3M", "6M", "1Y", "YTD", "ALL"];
const RANGE_LABEL: Record<Range, string> = {
  MTD: "Este mes", "1M": "1 mes", "3M": "3 meses", "6M": "6 meses", "1Y": "1 año", YTD: "Este año", ALL: "Todo",
};

function rangeStartDate(range: Range): string | null {
  const now = new Date();
  const d = new Date();
  switch (range) {
    case "MTD": d.setDate(1); break;
    case "1M": d.setMonth(now.getMonth() - 1); break;
    case "3M": d.setMonth(now.getMonth() - 3); break;
    case "6M": d.setMonth(now.getMonth() - 6); break;
    case "1Y": d.setFullYear(now.getFullYear() - 1); break;
    case "YTD": d.setMonth(0, 1); break;
    case "ALL": return null;
  }
  return d.toISOString().slice(0, 10);
}

function formatCOP(value: number): string {
  return `$${Math.round(value).toLocaleString("es-CO")}`;
}

function monthLabel(ym: string): string {
  const [year, month] = ym.split("-");
  return new Date(Number(year), Number(month) - 1, 1)
    .toLocaleDateString("es-CO", { month: "short", year: "2-digit" })
    .replace(".", "");
}

function BarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="perf-tooltip">
      <div style={{ textTransform: "capitalize" }}>{monthLabel(label)}</div>
      <div style={{ fontWeight: 600, color: COLOR_ACCENT_700 }}>{formatCOP(payload[0].value)}</div>
    </div>
  );
}

export function DepositsAnalytics({ fundings }: Props) {
  const [range, setRange] = useState<Range>("1Y");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const start = rangeStartDate(range);
    if (!start) return fundings;
    return fundings.filter((f) => f.date >= start);
  }, [fundings, range]);

  const byMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of filtered) {
      const ym = f.date.slice(0, 7); // "YYYY-MM"
      map.set(ym, (map.get(ym) ?? 0) + f.usd_amount * f.trm);
    }
    return Array.from(map.entries())
      .map(([month, cop]) => ({ month, cop }))
      .sort((a, b) => (a.month < b.month ? -1 : 1));
  }, [filtered]);

  const byPlatform = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of filtered) {
      map.set(f.broker_method, (map.get(f.broker_method) ?? 0) + f.usd_amount * f.trm);
    }
    const total = Array.from(map.values()).reduce((s, v) => s + v, 0) || 1;
    return Array.from(map.entries())
      .map(([method, cop]) => ({ method, cop, pct: (cop / total) * 100 }))
      .sort((a, b) => b.cop - a.cop);
  }, [filtered]);

  const totalPeriod = useMemo(() => byMonth.reduce((s, m) => s + m.cop, 0), [byMonth]);
  const maxMonth = useMemo(() => byMonth.reduce((max, m) => (m.cop > max ? m.cop : max), 0), [byMonth]);

  if (fundings.length === 0) {
    return <div className="empty-note">Aún no hay fondeos para mostrar análisis.</div>;
  }

  return (
    <div className="grid-split">
      <div className="deposits-chart-card">
        <div className="deposits-chart-head">
          <div>
            <h3 style={{ margin: 0 }}>Flujo de depósitos</h3>
            <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>
              {byMonth.length > 0 ? (
                <>Total en {RANGE_LABEL[range].toLowerCase()}: <strong style={{ color: COLOR_ACCENT_700 }}>{formatCOP(totalPeriod)}</strong></>
              ) : "Sin depósitos en este rango"}
            </div>
          </div>
          <div className="seg seg-sm" role="group" aria-label="Rango de tiempo">
            {RANGES.map((r) => (
              <label key={r} className="seg-opt">
                <input type="radio" name="deposits-range" checked={range === r} onChange={() => setRange(r)} />
                <span>{r}</span>
              </label>
            ))}
          </div>
        </div>

        {byMonth.length === 0 ? (
          <div className="chart-empty" style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
            No hay depósitos en este período — prueba un rango más amplio.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={byMonth} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
              onMouseLeave={() => setHoverIdx(null)}
            >
              <defs>
                <linearGradient id="depositsBarGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLOR_ACCENT_500} />
                  <stop offset="100%" stopColor={COLOR_ACCENT_700} />
                </linearGradient>
                <linearGradient id="depositsBarGradientHover" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#62c5ee" />
                  <stop offset="100%" stopColor={COLOR_ACCENT_800} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="month" tickFormatter={monthLabel}
                tick={{ fontSize: 11, fill: "#8a8685" }} axisLine={{ stroke: COLOR_DIVIDER }}
                tickLine={false} minTickGap={20}
              />
              <YAxis hide />
              <Tooltip
                content={<BarTooltip />}
                cursor={{ fill: "color-mix(in srgb, var(--color-text) 6%, transparent)", radius: 6 }}
              />
              <Bar
                dataKey="cop" radius={[6, 6, 2, 2]}
                onMouseOver={(_, i) => setHoverIdx(i)}
                isAnimationActive
                animationDuration={500}
              >
                {byMonth.map((m, i) => (
                  <Cell
                    key={m.month}
                    fill={i === hoverIdx ? "url(#depositsBarGradientHover)" : "url(#depositsBarGradient)"}
                    stroke={m.cop === maxMonth ? COLOR_ACCENT_800 : "transparent"}
                    strokeWidth={m.cop === maxMonth ? 1.5 : 0}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div>
        <div className="row-hd">
          <h3 style={{ margin: 0 }}>Depósitos por plataforma</h3>
        </div>
        <div>
          {byPlatform.map((p) => (
            <div className="alloc-row" key={p.method}>
              <span className="alloc-name">{p.method}</span>
              <div className="alloc-bar">
                <span style={{ width: `${Math.min(p.pct, 100)}%` }}></span>
              </div>
              <span className="alloc-pct">{p.pct.toFixed(1)}%</span>
            </div>
          ))}
          {byPlatform.length === 0 && (
            <div className="empty-note">Sin depósitos en este período.</div>
          )}
        </div>
        <div className="quick-stats">
          <div className="qs-row">
            <span>Total de fondeos</span>
            <span>{filtered.length}</span>
          </div>
          <div className="qs-row">
            <span>Plataformas usadas</span>
            <span>{byPlatform.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
