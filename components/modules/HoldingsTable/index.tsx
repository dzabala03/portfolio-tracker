"use client";

import { useState, useMemo } from "react";
import type { ReactNode } from "react";
import { formatCurrency, formatPercent, formatShares } from "@/lib/finance/calculations";
import { clsx } from "clsx";

export interface PositionRow {
  ticker: string;
  companyName: string;
  isOpen: boolean; // false = posición vendida/cerrada
  shares: number;
  avgCost: number | null;
  weight: number | null;
  currentPrice: number | null;
  dailyChange: number | null;
  dailyChangePct: number | null;
  currentValue: number | null;
  unrealizedPnL: number | null;
  totalPnL: number;
  realizedPnL: number;
  nextEarningsDate: string | null;
  earningsTiming: "bmo" | "amc" | "" | null;
  postMarketChangeValue: number | null;
  postMarketChangePct: number | null;
}

interface Props {
  rows: PositionRow[];
  isLoading?: boolean;
}

type SortKey =
  | "ticker" | "shares" | "avgCost" | "currentPrice" | "dailyChangePct"
  | "postMarketChangePct" | "postMarketChangeValue"
  | "currentValue" | "weight" | "unrealizedPnL" | "totalPnL";
type SortDir = "asc" | "desc";

interface ColumnDef {
  key: SortKey;
  label: string;
  align: "left" | "right";
  render: (row: PositionRow) => ReactNode;
}

const EARNINGS_TIMING_LABEL: Record<string, string> = {
  bmo: "antes apertura",
  amc: "después cierre",
};

function formatEarningsDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short" }).replace(".", "");
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {[...Array(cols)].map((_, i) => (
        <td key={i} style={{ padding: "var(--space-2)" }}>
          <div style={{ height: 14, background: "var(--color-neutral-200)", borderRadius: 2, opacity: 0.6 }} />
        </td>
      ))}
    </tr>
  );
}

export function HoldingsTable({ rows, isLoading }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("currentValue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Las columnas de pos-market solo existen mientras el backend las
  // adjunte (ventana 4-8pm ET) — si nadie trae el dato, ni se muestran.
  const showPostMarket = rows.some((r) => r.postMarketChangePct !== null);

  const columns: ColumnDef[] = useMemo(() => {
    const cols: ColumnDef[] = [
      {
        key: "ticker", label: "Activo", align: "left",
        render: (row) => (
          <>
            <strong>{row.ticker}</strong>
            <div className="tkr-name">
              {row.companyName}
              {!row.isOpen && " · vendida"}
            </div>
          </>
        ),
      },
      {
        key: "shares", label: "Cant.", align: "right",
        render: (row) => (row.isOpen ? formatShares(row.shares) : "—"),
      },
      {
        key: "avgCost", label: "Costo prom.", align: "right",
        render: (row) => (row.avgCost !== null ? formatCurrency(row.avgCost) : "—"),
      },
      {
        key: "currentPrice", label: "Precio", align: "right",
        render: (row) => (row.currentPrice !== null ? formatCurrency(row.currentPrice) : "—"),
      },
      {
        key: "dailyChangePct", label: "Hoy", align: "right",
        render: (row) => (
          <span className={clsx(row.dailyChange !== null && (row.dailyChange >= 0 ? "gain" : "loss"))}>
            {row.dailyChange !== null ? (
              <>
                {row.dailyChange >= 0 ? "+" : ""}
                {formatCurrency(row.dailyChange)}
                <div className="tkr-name" style={{ fontStyle: "normal" }}>
                  {formatPercent(row.dailyChangePct!)}
                </div>
              </>
            ) : "—"}
          </span>
        ),
      },
    ];

    if (showPostMarket) {
      cols.push(
        {
          key: "postMarketChangePct", label: "Pos-mkt %", align: "right",
          render: (row) => (
            <span className={clsx(row.postMarketChangePct !== null && (row.postMarketChangePct >= 0 ? "gain" : "loss"))}>
              {row.postMarketChangePct !== null ? formatPercent(row.postMarketChangePct) : "—"}
            </span>
          ),
        },
        {
          key: "postMarketChangeValue", label: "Pos-mkt $", align: "right",
          render: (row) => (
            <span className={clsx(row.postMarketChangeValue !== null && (row.postMarketChangeValue >= 0 ? "gain" : "loss"))}>
              {row.postMarketChangeValue !== null
                ? `${row.postMarketChangeValue >= 0 ? "+" : ""}${formatCurrency(row.postMarketChangeValue)}`
                : "—"}
            </span>
          ),
        },
      );
    }

    cols.push(
      {
        key: "currentValue", label: "Valor", align: "right",
        render: (row) => (row.currentValue !== null ? formatCurrency(row.currentValue) : "—"),
      },
      {
        key: "weight", label: "Peso", align: "right",
        render: (row) => (row.weight !== null ? `${row.weight.toFixed(1)}%` : "—"),
      },
      {
        key: "unrealizedPnL", label: "P&L", align: "right",
        render: (row) => (
          <span className={clsx(row.unrealizedPnL !== null && (row.unrealizedPnL >= 0 ? "gain" : "loss"))}>
            {row.unrealizedPnL !== null ? <>{row.unrealizedPnL >= 0 ? "+" : ""}{formatCurrency(row.unrealizedPnL)}</> : "—"}
          </span>
        ),
      },
      {
        key: "totalPnL", label: "Ganancia total", align: "right",
        render: (row) => (
          <span className={clsx(row.totalPnL >= 0 ? "gain" : "loss")}>
            {row.totalPnL >= 0 ? "+" : ""}
            {formatCurrency(row.totalPnL)}
            {row.realizedPnL !== 0 && (
              <div className="tkr-name" style={{ fontStyle: "normal" }}>
                incl. {row.realizedPnL >= 0 ? "+" : ""}
                {formatCurrency(row.realizedPnL)} realizado
              </div>
            )}
          </span>
        ),
      },
    );

    return cols;
  }, [showPostMarket]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "ticker" ? "asc" : "desc");
    }
  }

  function compareNullable(a: number | null, b: number | null, dir: 1 | -1): number {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return (a - b) * dir;
  }

  const sortedRows = useMemo(() => {
    const dir: 1 | -1 = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === "ticker") return a.ticker.localeCompare(b.ticker) * dir;
      return compareNullable(a[sortKey] as number | null, b[sortKey] as number | null, dir);
    });
  }, [rows, sortKey, sortDir]);

  if (!isLoading && rows.length === 0) {
    return (
      <div className="empty-note">Sin posiciones activas — agrega tu primera transacción para verlas aquí.</div>
    );
  }

  const totalCols = columns.length + 1; // +1 por la columna de earnings

  return (
    <table className="table holdings" aria-label="Holdings del portafolio">
      <thead>
        <tr>
          {columns.map((col) => (
            <th
              key={col.key}
              className={col.align === "right" ? "num" : undefined}
              onClick={() => handleSort(col.key)}
              style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
              aria-sort={sortKey === col.key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
            >
              {col.label}
              {sortKey === col.key && <span style={{ marginLeft: 4, color: "var(--color-accent)" }}>{sortDir === "asc" ? "▲" : "▼"}</span>}
            </th>
          ))}
          <th style={{ whiteSpace: "nowrap" }}>Earnings</th>
        </tr>
      </thead>
      <tbody>
        {isLoading
          ? [...Array(4)].map((_, i) => <SkeletonRow key={i} cols={totalCols} />)
          : sortedRows.map((row) => (
              <tr key={row.ticker} style={!row.isOpen ? { opacity: 0.6 } : undefined}>
                {columns.map((col) => (
                  <td key={col.key} className={col.align === "right" ? "num" : undefined}>
                    {col.render(row)}
                  </td>
                ))}
                <td>
                  {row.nextEarningsDate ? (
                    <>
                      {formatEarningsDate(row.nextEarningsDate)}
                      {row.earningsTiming && EARNINGS_TIMING_LABEL[row.earningsTiming] && (
                        <div className="tkr-name" style={{ fontStyle: "normal" }}>
                          {EARNINGS_TIMING_LABEL[row.earningsTiming]}
                        </div>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
      </tbody>
    </table>
  );
}
