"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { formatCurrency, formatPercent } from "@/lib/finance/calculations";

type Range = "1W" | "MTD" | "1M" | "3M" | "6M" | "1Y" | "YTD" | "ALL";
const RANGES: Range[] = ["1W", "MTD", "1M", "3M", "6M", "1Y", "YTD", "ALL"];

interface AssetChange {
  ticker: string;
  changePct: number;
  changeValue: number;
}

export function BestWorstAsset() {
  const [range, setRange] = useState<Range>("1M");
  const [assets, setAssets] = useState<AssetChange[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async (r: Range) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/portfolio/asset-performance?range=${r}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setAssets(json.assets ?? []);
    } catch (err) {
      console.error("[BestWorstAsset]", err);
      setAssets([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load(range);
  }, [range, load]);

  const { best, worst } = useMemo(() => {
    if (!assets || assets.length === 0) return { best: null, worst: null };
    const best = assets.reduce((a, b) => (b.changePct > a.changePct ? b : a));
    const worst = assets.reduce((a, b) => (b.changePct < a.changePct ? b : a));
    return { best, worst };
  }, [assets]);

  return (
    <>
      <div className="qs-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
        <div className="seg" role="group" aria-label="Rango para mejor/peor activo">
          {RANGES.map((r) => (
            <label key={r} className="seg-opt" style={{ padding: "4px 8px", fontSize: 11 }}>
              <input type="radio" name="bw-range" checked={range === r} onChange={() => setRange(r)} />
              <span>{r}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="qs-row">
        <span>Mejor activo ({range})</span>
        {isLoading ? (
          <span className="text-muted">…</span>
        ) : best ? (
          <span className="gain">
            {best.ticker} {formatPercent(best.changePct)}
            {" "}({best.changeValue >= 0 ? "+" : ""}{formatCurrency(best.changeValue)})
          </span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </div>
      <div className="qs-row">
        <span>Peor activo ({range})</span>
        {isLoading ? (
          <span className="text-muted">…</span>
        ) : worst ? (
          <span className="loss">
            {worst.ticker} {formatPercent(worst.changePct)}
            {" "}({worst.changeValue >= 0 ? "+" : ""}{formatCurrency(worst.changeValue)})
          </span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </div>
    </>
  );
}
