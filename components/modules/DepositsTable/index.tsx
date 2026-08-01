"use client";

import type { BrokerFunding } from "@/types";
import { Trash2 } from "lucide-react";

interface Props {
  fundings: BrokerFunding[];
  isLoading?: boolean;
  selectedIds: Set<string>;
  onToggleOne: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  onDeleteOne: (id: string) => void;
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`)
    .toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })
    .replace(".", "");
}

function formatCOP(value: number): string {
  return `$${value.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;
}

function formatUSD(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function DepositsTable({ fundings, isLoading, selectedIds, onToggleOne, onToggleAll, onDeleteOne }: Props) {
  if (!isLoading && fundings.length === 0) {
    return <div className="empty-note">Sin fondeos registrados todavía — usa "Fondeo broker" para agregar el primero.</div>;
  }

  const allSelected = fundings.length > 0 && fundings.every((f) => selectedIds.has(f.id));

  return (
    <table className="table">
      <thead>
        <tr>
          <th style={{ width: 28 }}>
            <input
              type="checkbox"
              aria-label="Seleccionar todos los fondeos"
              checked={allSelected}
              onChange={(e) => onToggleAll(e.target.checked)}
              disabled={isLoading}
            />
          </th>
          <th>Fecha</th>
          <th>Método</th>
          <th className="num">TRM</th>
          <th className="num">USD enviado</th>
          <th className="num">COP enviado</th>
          <th className="num">Comisión</th>
          <th style={{ width: 36 }}></th>
        </tr>
      </thead>
      <tbody>
        {isLoading
          ? [...Array(3)].map((_, i) => (
              <tr key={i}>
                {[...Array(8)].map((_, j) => (
                  <td key={j} style={{ padding: "var(--space-2)" }}>
                    <div style={{ height: 14, background: "var(--color-neutral-200)", borderRadius: 2, opacity: 0.6 }} />
                  </td>
                ))}
              </tr>
            ))
          : fundings.map((f) => (
              <tr key={f.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Seleccionar fondeo del ${formatDate(f.date)}`}
                    checked={selectedIds.has(f.id)}
                    onChange={() => onToggleOne(f.id)}
                  />
                </td>
                <td>{formatDate(f.date)}</td>
                <td>
                  {f.broker_method}
                  {!f.transaction_id && (
                    <span className="tag tag-neutral" style={{ marginLeft: 6, fontSize: 10 }}>
                      No en portafolio USD
                    </span>
                  )}
                </td>
                <td className="num">{formatCOP(f.trm)}</td>
                <td className="num">{formatUSD(f.usd_amount)}</td>
                <td className="num">{formatCOP(f.usd_amount * f.trm)}</td>
                <td className="num">
                  {formatCOP(f.fee_cop)}
                  <div className="tkr-name" style={{ fontStyle: "normal" }}>
                    {formatUSD(f.fee_usd)}
                  </div>
                </td>
                <td>
                  <button
                    className="btn btn-icon btn-icon-sm"
                    aria-label="Eliminar fondeo"
                    onClick={() => onDeleteOne(f.id)}
                  >
                    <Trash2 size={14} color="var(--color-loss)" />
                  </button>
                </td>
              </tr>
            ))}
      </tbody>
    </table>
  );
}
