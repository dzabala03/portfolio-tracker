"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { formatCurrency } from "@/lib/finance/calculations";

// Deben mantenerse en sync con los tokens de app/globals.css —
// los atributos SVG de recharts no resuelven var(--color-*).
const COLOR_ACCENT = "#0088b0";
const COLOR_ACCENT_100 = "#e9f8ff";
const COLOR_GAIN = "#1a7a3c";
const COLOR_LOSS = "#b3261e";
const COLOR_DIVIDER = "#e3e1e0";

type Range = "MTD" | "1M" | "6M" | "1Y" | "YTD";
const RANGES: Range[] = ["MTD", "1M", "6M", "1Y", "YTD"];

interface PerformanceData {
  range: Range;
  series: { date: string; value: number }[];
  twr: number;
  mwr: number;
  startValue: number;
  endValue: number;
}

function formatChartDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short" }).replace(".", "");
}

function TooltipContent({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as { date: string; value: number };
  return (
    <div className="perf-tooltip">
      <div>{formatChartDate(point.date)}</div>
      <div style={{ fontWeight: 600 }}>{formatCurrency(point.value)}</div>
    </div>
  );
}

export function PerformanceChart() {
  const [range, setRange] = useState<Range>("1M");
  const [data, setData] = useState<PerformanceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (r: Range) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/portfolio/performance?range=${r}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: PerformanceData = await res.json();
      setData(json);
    } catch (err) {
      setError("No se pudo cargar el rendimiento histórico.");
      console.error("[PerformanceChart]", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load(range);
  }, [range, load]);

  const hasSeries = (data?.series.length ?? 0) >= 2;

  return (
    <div className="chart-wrap">
      <div className="chart-head">
        <h3 style={{ margin: 0 }}>Evolución del valor</h3>
        <div className="seg" role="group" aria-label="Rango de tiempo">
          {RANGES.map((r) => (
            <label key={r} className="seg-opt">
              <input type="radio" name="range" checked={range === r} onChange={() => setRange(r)} />
              <span>{r}</span>
            </label>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="chart-empty">Calculando rendimiento histórico…</div>
      )}

      {!isLoading && error && (
        <div className="chart-empty">{error}</div>
      )}

      {!isLoading && !error && !hasSeries && (
        <div className="chart-empty">
          No hay suficiente historial de precios para este rango todavía.
          <br />
          Prueba con un rango más amplio o revisa que tus posiciones tengan transacciones en este período.
        </div>
      )}

      {!isLoading && !error && hasSeries && data && (
        <>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data.series} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="perfFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLOR_ACCENT_100} stopOpacity={1} />
                  <stop offset="100%" stopColor={COLOR_ACCENT_100} stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={formatChartDate}
                tick={{ fontSize: 11, fill: "#8a8685" }}
                axisLine={{ stroke: COLOR_DIVIDER }}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip content={<TooltipContent />} />
              <Area
                type="monotone"
                dataKey="value"
                stroke={COLOR_ACCENT}
                strokeWidth={2}
                fill="url(#perfFill)"
              />
            </AreaChart>
          </ResponsiveContainer>

          <div className="perf-stats">
            <div>
              <div className="perf-stat-label">TWR — Time-Weighted Return</div>
              <div className="perf-stat-value" style={{ color: data.twr >= 0 ? COLOR_GAIN : COLOR_LOSS }}>
                {data.twr >= 0 ? "+" : ""}{data.twr.toFixed(2)}%
              </div>
              <div className="perf-stat-caption">
                Rendimiento puro de tus inversiones — ignora cuándo depositaste. Responde: ¿qué tan buenas fueron mis decisiones?
              </div>
            </div>
            <div>
              <div className="perf-stat-label">MWR — Money-Weighted Return</div>
              <div className="perf-stat-value" style={{ color: data.mwr >= 0 ? COLOR_GAIN : COLOR_LOSS }}>
                {data.mwr >= 0 ? "+" : ""}{data.mwr.toFixed(2)}%
              </div>
              <div className="perf-stat-caption">
                Tu rendimiento real como inversionista — penaliza aportes mal cronometrados. Responde: ¿cuánto gané yo en realidad?
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
