"use client";

import { useState, useRef } from "react";
import Papa from "papaparse";
import type { NewBrokerFunding, FeeCurrency } from "@/types";
import { Upload, AlertCircle, CheckCircle, Loader2, FileText, Download } from "lucide-react";
import { downloadCsv } from "@/lib/utils/csv";

// ─── Estructura esperada: mismos campos que el formulario de
// "Fondeo broker" (broker_method, trm, usd_amount son obligatorios;
// el resto tiene default). Ver REQUIRED_COLUMNS más abajo, que
// también alimenta el mensaje de ayuda en la sección Pesos COP.

export const FUNDING_CSV_REQUIRED_COLUMNS = ["broker_method", "trm", "usd_amount", "date"];
export const FUNDING_CSV_OPTIONAL_COLUMNS = ["fee_amount", "fee_currency", "notes", "include_in_portfolio"];

// ─── Formato de ejemplo descargable ───────────────────────────
// Tres casos representativos: comisión pagada en USD, comisión
// pagada en COP, y un fondeo histórico marcado como "no incluir en
// el portafolio USD" (include_in_portfolio en no).

export const SAMPLE_FUNDINGS_CSV = `broker_method,trm,usd_amount,fee_amount,fee_currency,date,notes,include_in_portfolio
ARQ,3987.50,500.00,10.00,USD,2026-01-15,Primer fondeo,si
Global66,4050.00,300.00,45000,COP,2026-03-01,,si
ARQ,4200.00,250.00,3.00,USD,2025-11-10,Fondeo histórico ya contabilizado,no
`;

interface FundingCsvRow {
  row: number;
  data: NewBrokerFunding;
}

interface FundingCsvImportResult {
  valid: FundingCsvRow[];
  errors: { row: number; message: string }[];
}

function parseDate(raw: string): string {
  const trimmed = (raw ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parts = trimmed.split("/");
  if (parts.length === 3) {
    const [day, month, year] = parts;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return trimmed;
}

function parseIncludeFlag(raw: string | undefined): boolean {
  if (raw === undefined || raw.trim() === "") return true;
  const v = raw.trim().toLowerCase();
  return !(v === "no" || v === "false" || v === "0");
}

function parseCsvRows(rows: Record<string, string>[]): FundingCsvImportResult {
  const valid: FundingCsvRow[] = [];
  const errors: { row: number; message: string }[] = [];

  rows.forEach((raw, i) => {
    const rowNum = i + 2;
    const r: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) r[k.toLowerCase().trim()] = v?.trim() ?? "";

    const brokerMethod = (r["broker_method"] ?? "").trim();
    if (!brokerMethod) {
      errors.push({ row: rowNum, message: "broker_method vacío" });
      return;
    }

    const trm = parseFloat(r["trm"] ?? "");
    if (isNaN(trm) || trm <= 0) {
      errors.push({ row: rowNum, message: `trm inválida: "${r["trm"]}"` });
      return;
    }

    const usdAmount = parseFloat(r["usd_amount"] ?? "");
    if (isNaN(usdAmount) || usdAmount <= 0) {
      errors.push({ row: rowNum, message: `usd_amount inválido: "${r["usd_amount"]}"` });
      return;
    }

    const date = parseDate(r["date"] ?? "");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push({ row: rowNum, message: `fecha inválida: "${r["date"]}" (esperado YYYY-MM-DD o DD/MM/YYYY)` });
      return;
    }

    const feeCurrencyRaw = (r["fee_currency"] || "USD").toUpperCase();
    if (feeCurrencyRaw !== "USD" && feeCurrencyRaw !== "COP") {
      errors.push({ row: rowNum, message: `fee_currency inválida: "${r["fee_currency"]}" (USD o COP)` });
      return;
    }

    const feeAmount = parseFloat(r["fee_amount"] || "0");
    if (isNaN(feeAmount) || feeAmount < 0) {
      errors.push({ row: rowNum, message: `fee_amount inválido: "${r["fee_amount"]}"` });
      return;
    }

    valid.push({
      row: rowNum,
      data: {
        broker_method: brokerMethod,
        trm,
        usd_amount: usdAmount,
        fee_amount: feeAmount,
        fee_currency: feeCurrencyRaw as FeeCurrency,
        date,
        notes: r["notes"] || undefined,
        include_in_portfolio: parseIncludeFlag(r["include_in_portfolio"]),
      },
    });
  });

  return { valid, errors };
}

interface Props {
  onSuccess?: () => void;
}

export function FundingCsvImporter({ onSuccess }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<FundingCsvImportResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ imported: number; failed: number } | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setPreview(null);
    setUploadResult(null);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => setPreview(parseCsvRows(results.data)),
    });
  }

  async function handleImport() {
    if (!preview || preview.valid.length === 0) return;
    setIsUploading(true);
    let imported = 0, failed = 0;

    for (const { data } of preview.valid) {
      try {
        const res = await fetch("/api/broker-fundings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (res.ok) imported++; else failed++;
      } catch { failed++; }
    }

    setIsUploading(false);
    setUploadResult({ imported, failed });
    setPreview(null);
    setFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (imported > 0) onSuccess?.();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <div className="card" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <span className="kicker" style={{ margin: 0 }}>Formato necesario de ejemplo</span>
        <button
          type="button"
          className="btn btn-icon icon-btn"
          aria-label="Descargar formato de ejemplo (CSV)"
          title="Descargar formato de ejemplo (CSV)"
          onClick={() => downloadCsv("ejemplo-fondeos.csv", SAMPLE_FUNDINGS_CSV)}
        >
          <Download size={16} color="var(--color-accent)" />
        </button>
      </div>

      <div
        style={{
          border: "1px dashed var(--color-divider)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-6)",
          textAlign: "center",
          cursor: "pointer",
        }}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
        role="button" tabIndex={0} aria-label="Seleccionar archivo CSV de fondeos"
      >
        <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileChange} style={{ display: "none" }} aria-hidden="true" />
        <Upload size={22} style={{ margin: "0 auto 10px", color: "var(--color-accent)", display: "block" }} />
        <p style={{ fontSize: 14, margin: 0 }}>
          {fileName ?? "Arrastra un CSV de fondeos o haz clic para seleccionar"}
        </p>
        <p className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
          Columnas: {FUNDING_CSV_REQUIRED_COLUMNS.join(", ")} (+ {FUNDING_CSV_OPTIONAL_COLUMNS.join(", ")})
        </p>
      </div>

      {preview && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-3)", fontSize: 13 }}>
            <span className="gain" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <CheckCircle size={14} />{preview.valid.length} válidos
            </span>
            {preview.errors.length > 0 && (
              <span className="loss" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <AlertCircle size={14} />{preview.errors.length} errores
              </span>
            )}
          </div>

          {preview.errors.length > 0 && (
            <div className="card" style={{ maxHeight: 128, overflowY: "auto", gap: 4 }}>
              {preview.errors.map((err) => (
                <p key={err.row} className="loss" style={{ fontSize: 12, margin: 0 }}>Fila {err.row}: {err.message}</p>
              ))}
            </div>
          )}

          {preview.valid.length > 0 && (
            <div className="card" style={{ maxHeight: 192, overflowY: "auto" }}>
              <p className="kicker" style={{ margin: 0 }}>Vista previa</p>
              {preview.valid.slice(0, 6).map(({ row, data }) => (
                <div key={row} className="num" style={{ display: "flex", gap: 12, fontSize: 12, textAlign: "left" }}>
                  <span style={{ width: 90 }}>{data.broker_method}</span>
                  <span>TRM {data.trm}</span>
                  <span>${data.usd_amount}</span>
                  <span className="text-muted">{data.date}</span>
                  {!data.include_in_portfolio && <span className="text-muted">(no USD)</span>}
                </div>
              ))}
              {preview.valid.length > 6 && (
                <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>y {preview.valid.length - 6} más...</p>
              )}
            </div>
          )}

          <button
            onClick={handleImport}
            disabled={isUploading || preview.valid.length === 0}
            className="btn btn-primary btn-block"
          >
            {isUploading
              ? <><Loader2 size={14} className="animate-spin" />Importando...</>
              : <><FileText size={14} />Importar {preview.valid.length} fondeos</>
            }
          </button>
        </div>
      )}

      {uploadResult && (
        <div className="tag tag-gain" style={{ width: "100%", flexDirection: "column", alignItems: "flex-start", gap: 4, padding: "10px 12px" }}>
          <p style={{ margin: 0, fontWeight: 600 }}>{uploadResult.imported} fondeos importados</p>
          {uploadResult.failed > 0 && (
            <p className="loss" style={{ fontSize: 12, margin: 0 }}>{uploadResult.failed} fallaron. Revisa los datos.</p>
          )}
        </div>
      )}
    </div>
  );
}
