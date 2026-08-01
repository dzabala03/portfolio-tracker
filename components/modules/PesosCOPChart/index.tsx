"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";

// Deben mantenerse en sync con los tokens de app/globals.css — los
// atributos SVG de recharts no resuelven var(--color-*).
const COLOR_SIN_EFECTO = "#0088b0"; // cyan — mismo tono que la línea de valor en USD
const COLOR_CON_EFECTO = "#ca8a04"; // ámbar — deliberadamente lejos de gain/loss
const COLOR_DIVIDER = "#e3e1e0";

type Range = "MTD" | "1M" | "3M" | "6M" | "1Y" | "YTD" | "ALL";
const RANGES: Range[] = ["MTD", "1M", "3M", "6M", "1Y", "YTD", "ALL"];

type ChartMode = "valor" | "pct";

interface ValuePoint { date: string; sinEfecto: number; conEfecto: number }
interface PercentPoint { date: string; pct: number }
interface PerformanceCopData {
  range: Range;
  valueSeries: ValuePoint[];
  twrSinEfecto: PercentPoint[];
  twrConEfecto: PercentPoint[];
}

function formatCOP(value: number): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.round(Math.abs(value)).toLocaleString("es-CO")}`;
}

function formatChartDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short" }).replace(".", "");
}

function ValueTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="perf-tooltip">
      <div>{formatChartDate(label)}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.stroke, fontWeight: 600 }}>
          {p.name}: {formatCOP(p.value)}
        </div>
      ))}
    </div>
  );
}

function PctTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="perf-tooltip">
      <div>{formatChartDate(label)}</div>
      {payload.map((p: any) => {
        if (p.value === undefined || p.value === null) return null;
        return (
          <div key={p.dataKey} style={{ color: p.stroke, fontWeight: 600 }}>
            {p.name}: {p.value >= 0 ? "+" : ""}{p.value.toFixed(2)}%
          </div>
        );
      })}
    </div>
  );
}

export function PesosCOPChart() {
  const [range, setRange] = useState<Range>("1M");
  const [mode, setMode] = useState<ChartMode>("valor");
  const [data, setData] = useState<PerformanceCopData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Guarda cuál es el rango más reciente pedido — si dos fetches quedan
  // en vuelo a la vez (ej. el del montaje inicial + un clic rápido de
  // rango) y el más viejo responde DESPUÉS del más nuevo, esto evita que
  // su respuesta obsoleta sobrescriba los datos del rango ya seleccionado.
  const latestRangeRef = useRef<Range>(range);

  const load = useCallback(async (r: Range) => {
    latestRangeRef.current = r;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/portfolio/performance-cop?range=${r}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: PerformanceCopData = await res.json();
      if (latestRangeRef.current !== r) return; // respuesta obsoleta
      setData(json);
    } catch (err) {
      if (latestRangeRef.current !== r) return;
      setError("No se pudo cargar la evolución en pesos.");
      console.error("[PesosCOPChart]", err);
    } finally {
      if (latestRangeRef.current === r) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load(range);
  }, [range, load]);

  const mergedPct = useMemo(() => {
    if (!data) return [];
    const byDate = new Map<string, { date: string; sinEfecto?: number; conEfecto?: number }>();
    for (const p of data.twrSinEfecto) {
      byDate.set(p.date, { ...(byDate.get(p.date) ?? { date: p.date }), sinEfecto: p.pct });
    }
    for (const p of data.twrConEfecto) {
      byDate.set(p.date, { ...(byDate.get(p.date) ?? { date: p.date }), conEfecto: p.pct });
    }
    return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [data]);

  const chartData = mode === "valor" ? (data?.valueSeries ?? []) : mergedPct;
  const hasSeries = chartData.length >= 2;

  return (
    <div className="chart-wrap">
      <div className="chart-head">
        <h3 style={{ margin: 0 }}>{mode === "valor" ? "Evolución del valor en pesos" : "Rendimiento en pesos"}</h3>
        <div className="seg" role="group" aria-label="Rango de tiempo">
          {RANGES.map((r) => (
            <label key={r} className="seg-opt">
              <input type="radio" name="range-cop" checked={range === r} onChange={() => setRange(r)} />
              <span>{r}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="chart-controls">
        <div className="seg" role="group" aria-label="Tipo de vista">
          <label className="seg-opt">
            <input type="radio" name="mode-cop" checked={mode === "valor"} onChange={() => setMode("valor")} />
            <span>Evolución del valor</span>
          </label>
          <label className="seg-opt">
            <input type="radio" name="mode-cop" checked={mode === "pct"} onChange={() => setMode("pct")} />
            <span>% de rendimiento</span>
          </label>
        </div>
      </div>

      {isLoading && <div className="chart-empty">Calculando…</div>}
      {!isLoading && error && <div className="chart-empty">{error}</div>}
      {!isLoading && !error && !hasSeries && (
        <div className="chart-empty">
          No hay suficiente historial de precios para este rango todavía.
          <br />
          Prueba con un rango más amplio.
        </div>
      )}

      {!isLoading && !error && hasSeries && (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <XAxis
              dataKey="date" tickFormatter={formatChartDate}
              tick={{ fontSize: 11, fill: "#8a8685" }} axisLine={{ stroke: COLOR_DIVIDER }}
              tickLine={false} minTickGap={40}
            />
            <YAxis
              hide={mode === "valor"}
              tickFormatter={mode === "pct" ? (v: number) => `${v.toFixed(0)}%` : undefined}
              domain={mode === "valor" ? ["auto", "auto"] : undefined}
              tick={{ fontSize: 11, fill: "#8a8685" }} axisLine={false} tickLine={false} width={44}
            />
            <Tooltip content={mode === "valor" ? <ValueTooltip /> : <PctTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone" dataKey="sinEfecto" name={mode === "valor" ? "Valor sin efecto TRM" : "Rendimiento sin efecto TRM"}
              stroke={COLOR_SIN_EFECTO} strokeWidth={2} dot={false} connectNulls
            />
            <Line
              type="monotone" dataKey="conEfecto" name={mode === "valor" ? "Valor con efecto TRM" : "Rendimiento con efecto TRM"}
              stroke={COLOR_CON_EFECTO} strokeWidth={2} dot={false} connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
