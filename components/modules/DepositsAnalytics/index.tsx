"use client";

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { BrokerFunding } from "@/types";

interface Props {
  fundings: BrokerFunding[];
}

const COLOR_ACCENT = "#0088b0";
const COLOR_DIVIDER = "#e3e1e0";

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
      <div>{monthLabel(label)}</div>
      <div style={{ fontWeight: 600 }}>{formatCOP(payload[0].value)}</div>
    </div>
  );
}

export function DepositsAnalytics({ fundings }: Props) {
  const byMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of fundings) {
      const ym = f.date.slice(0, 7); // "YYYY-MM"
      map.set(ym, (map.get(ym) ?? 0) + f.usd_amount * f.trm);
    }
    return Array.from(map.entries())
      .map(([month, cop]) => ({ month, cop }))
      .sort((a, b) => (a.month < b.month ? -1 : 1));
  }, [fundings]);

  const byPlatform = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of fundings) {
      map.set(f.broker_method, (map.get(f.broker_method) ?? 0) + f.usd_amount * f.trm);
    }
    const total = Array.from(map.values()).reduce((s, v) => s + v, 0) || 1;
    return Array.from(map.entries())
      .map(([method, cop]) => ({ method, cop, pct: (cop / total) * 100 }))
      .sort((a, b) => b.cop - a.cop);
  }, [fundings]);

  if (fundings.length === 0) {
    return <div className="empty-note">Aún no hay fondeos para mostrar análisis.</div>;
  }

  return (
    <div className="grid-split">
      <div>
        <div className="row-hd">
          <h3 style={{ margin: 0 }}>Depósitos por mes</h3>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={byMonth} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <XAxis
              dataKey="month" tickFormatter={monthLabel}
              tick={{ fontSize: 11, fill: "#8a8685" }} axisLine={{ stroke: COLOR_DIVIDER }}
              tickLine={false} minTickGap={20}
            />
            <YAxis hide />
            <Tooltip content={<BarTooltip />} cursor={{ fill: "color-mix(in srgb, var(--color-text) 6%, transparent)" }} />
            <Bar dataKey="cop" fill={COLOR_ACCENT} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
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
        </div>
        <div className="quick-stats">
          <div className="qs-row">
            <span>Total de fondeos</span>
            <span>{fundings.length}</span>
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
