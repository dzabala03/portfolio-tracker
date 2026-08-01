"use client";

import { useState, useRef } from "react";
import Papa from "papaparse";
import type { NewTransaction, TransactionType, CsvImportResult } from "@/types";
import { Upload, AlertCircle, CheckCircle, Loader2, FileText, Download } from "lucide-react";
import { downloadCsv } from "@/lib/utils/csv";

// ─── Mapeo de tipos del broker → tipos internos ───────────────
// Agrega aquí cualquier tipo nuevo que aparezca en tu CSV

const BROKER_TYPE_MAP: Record<string, TransactionType | "SKIP"> = {
  "buy":                   "BUY",
  "sell":                  "SELL",
  "dividend":              "DIVIDEND",
  "dividends":             "DIVIDEND",
  "deposit":               "DEPOSIT",
  "wire received":         "DEPOSIT",
  "ach deposit":           "DEPOSIT",
  "withdrawal":            "WITHDRAWAL",
  "ach withdrawal":        "WITHDRAWAL",
  "wire sent":             "WITHDRAWAL",
  "taxes and fees":        "FEE",
  "tax":                   "FEE",
  "fee":                   "FEE",
  "commission":            "FEE",
  "interest":              "INTEREST",
  "interest earned":       "INTEREST",
  // Tipos que se ignoran completamente
  "journal":               "SKIP",
  "transfer":              "SKIP",
};

function mapBrokerType(raw: string): TransactionType | "SKIP" | null {
  const normalized = raw.toLowerCase().trim();
  if (normalized in BROKER_TYPE_MAP) return BROKER_TYPE_MAP[normalized];
  // Si no está en el mapa, retornar null (se reportará como desconocido)
  return null;
}

// ─── Normalización de formato broker ─────────────────────────

function normalizeBrokerRow(row: Record<string, string>): Record<string, string> {
  const keys = Object.keys(row).map((k) => k.toLowerCase().trim());
  const isBrokerFormat = keys.includes("symbol") && keys.includes("side");
  if (!isBrokerFormat) return row;

  const r: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) r[k.toLowerCase().trim()] = v?.trim() ?? "";

  // NASDAQ:NFLX → NFLX, $CASH (u otro símbolo sin ":") → "CASH"
  const rawSymbol = r["symbol"] ?? "";
  const ticker = rawSymbol.includes(":")
    ? rawSymbol.split(":").pop()!
    : rawSymbol.replace(/^\$/, "") || "CASH";

  const rawType = r["side"] ?? "";
  const mappedType = mapBrokerType(rawType);
  const isTrade = mappedType === "BUY" || mappedType === "SELL";

  // "9/02/2026 15:33" → "2026-09-02"
  const rawDate = (r["closing time"] ?? "").split(" ")[0];
  const date = parseBrokerDate(rawDate);

  // En BUY/SELL, qty = cantidad de acciones. En movimientos de efectivo
  // (Dividend/Deposit/Taxes and fees) este broker reutiliza la misma
  // columna Qty para el monto en USD, ya que Fill Price queda vacío.
  const qty = r["qty"] || "0";
  const price = isTrade
    ? (r["fill price"] || "0")
    : (r["fill price"] || r["amount"] || qty || "0");

  return {
    ticker,
    type: mappedType ?? rawType,  // si no se mapeó, dejar el original para el error
    _mappedType: mappedType ?? "",
    shares: qty,
    price,
    fees: r["commission"] ?? "0",
    date,
    notes: rawType, // guardar el tipo original del broker como nota
  };
}

function parseBrokerDate(raw: string): string {
  if (!raw) return "";
  const parts = raw.split("/");
  if (parts.length !== 3) return raw;
  // El broker exporta "Closing Time" en formato DD/MM/YYYY (confirmado con
  // filas como "30/06/2026", donde 30 no puede ser mes).
  const [day, month, year] = parts;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

// ─── Validación ───────────────────────────────────────────────

function parseCsvRows(rows: Record<string, string>[]): CsvImportResult {
  const valid: NewTransaction[] = [];
  const errors: { row: number; message: string }[] = [];
  let skipped = 0;

  rows.forEach((rawRow, i) => {
    const rowNum = i + 2;
    const row = normalizeBrokerRow(rawRow);

    const rawType = (row["type"] ?? row["side"] ?? "").trim();
    const mappedType = row["_mappedType"] || mapBrokerType(rawType);

    // Tipo desconocido → error visible
    if (mappedType === null) {
      errors.push({ row: rowNum, message: `Tipo desconocido: "${rawType}" — agregar al mapa si aplica` });
      return;
    }

    // Tipo ignorado explícitamente (JOURNAL, TRANSFER, etc.)
    if (mappedType === "SKIP") {
      skipped++;
      return;
    }

    const type = mappedType as TransactionType;
    const isTrade = type === "BUY" || type === "SELL";

    // Validar ticker (solo requerido para trades)
    const ticker = (row["ticker"] ?? "").trim().toUpperCase() || (isTrade ? "" : "CASH");
    if (isTrade && !ticker) {
      errors.push({ row: rowNum, message: "ticker vacío en transacción BUY/SELL" });
      return;
    }

    // Validar precio / monto
    const price = parseFloat(row["price"] ?? "0");
    if (isNaN(price) || price < 0) {
      errors.push({ row: rowNum, message: `precio/monto inválido: "${row["price"]}"` });
      return;
    }

    // Shares: 0 para movimientos de efectivo
    const shares = isTrade ? parseFloat(row["shares"] ?? "0") : 0;
    if (isTrade && (isNaN(shares) || shares <= 0)) {
      errors.push({ row: rowNum, message: `qty inválido para ${type}: "${row["shares"]}"` });
      return;
    }

    const date = (row["date"] ?? "").trim();
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push({ row: rowNum, message: `fecha inválida: "${date}" (esperado: YYYY-MM-DD)` });
      return;
    }

    valid.push({
      ticker: ticker || "CASH",
      type,
      shares,
      price,
      date,
      fees: parseFloat(row["fees"] ?? "0") || 0,
      notes: row["notes"]?.trim() || undefined,
    });
  });

  return { valid, errors, skipped };
}

// ─── Formato de ejemplo descargable ───────────────────────────
// Una fila por cada tipo de transacción soportado, con valores
// ficticios pero realistas — así se ve exactamente cómo van los
// campos de cada caso (compra/venta con acciones y precio; los
// movimientos de efectivo con shares=0 y el monto en price).

export const SAMPLE_TRANSACTIONS_CSV = `ticker,type,shares,price,fees,date,notes
AAPL,BUY,10,185.50,1.00,2026-01-15,Compra inicial
AAPL,SELL,4,210.30,1.00,2026-03-10,Venta parcial
AAPL,DIVIDEND,0,12.40,0,2026-02-15,Dividendo trimestral
CASH,DEPOSIT,0,500.00,0,2026-01-01,Depósito inicial
CASH,WITHDRAWAL,0,100.00,0,2026-04-01,Retiro
CASH,FEE,0,5.00,0,2026-01-31,Comisión mensual
CASH,INTEREST,0,2.35,0,2026-02-28,Interés generado
`;

// ─── Labels para mostrar en UI ────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  BUY: "Compra", SELL: "Venta", DIVIDEND: "Dividendo",
  DEPOSIT: "Depósito", WITHDRAWAL: "Retiro", FEE: "Comisión/Impuesto",
  INTEREST: "Interés",
};

// ─── Componente ───────────────────────────────────────────────

interface Props {
  onSuccess?: () => void;
}

export function CsvImporter({ onSuccess }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<CsvImportResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ imported: number; failed: number } | null>(null);
  const [detectedFormat, setDetectedFormat] = useState<"standard" | "broker" | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setPreview(null);
    setUploadResult(null);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const firstKeys = Object.keys(results.data[0] ?? {}).map((k) => k.toLowerCase().trim());
        setDetectedFormat(firstKeys.includes("symbol") && firstKeys.includes("side") ? "broker" : "standard");
        setPreview(parseCsvRows(results.data));
      },
    });
  }

  async function handleImport() {
    if (!preview || preview.valid.length === 0) return;
    setIsUploading(true);
    let imported = 0, failed = 0;

    for (const tx of preview.valid) {
      try {
        const res = await fetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tx),
        });
        if (res.ok) imported++; else failed++;
      } catch { failed++; }
    }

    setIsUploading(false);
    setUploadResult({ imported, failed });
    setPreview(null);
    setFileName(null);
    setDetectedFormat(null);
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
          onClick={() => downloadCsv("ejemplo-transacciones.csv", SAMPLE_TRANSACTIONS_CSV)}
        >
          <Download size={16} color="var(--color-accent)" />
        </button>
      </div>

      {/* Drop area */}
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
        role="button" tabIndex={0} aria-label="Seleccionar archivo CSV"
      >
        <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileChange} style={{ display: "none" }} aria-hidden="true" />
        <Upload size={22} style={{ margin: "0 auto 10px", color: "var(--color-accent)", display: "block" }} />
        <p style={{ fontSize: 14, margin: 0 }}>
          {fileName ?? "Arrastra un CSV o haz clic para seleccionar"}
        </p>
        <p className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>Soporta el formato de tu broker y el formato estándar</p>
      </div>

      {/* Formato detectado */}
      {detectedFormat && (
        <p className="tag tag-accent" style={{ width: "fit-content" }}>
          {detectedFormat === "broker"
            ? "Formato de broker detectado — columnas mapeadas automáticamente"
            : "Formato estándar detectado"}
        </p>
      )}

      {/* Vista previa */}
      {preview && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-3)", fontSize: 13 }}>
            <span className="gain" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <CheckCircle size={14} />{preview.valid.length} válidas
            </span>
            {preview.skipped > 0 && (
              <span className="text-muted" style={{ fontSize: 12 }}>{preview.skipped} ignoradas (journal/transfer)</span>
            )}
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
              {preview.valid.slice(0, 6).map((tx, i) => (
                <div key={i} className="num" style={{ display: "flex", gap: 12, fontSize: 12, textAlign: "left" }}>
                  <span
                    className={
                      tx.type === "BUY" ? "gain" :
                      tx.type === "SELL" ? "loss" :
                      tx.type === "DIVIDEND" || tx.type === "DEPOSIT" || tx.type === "INTEREST" ? undefined :
                      "text-muted"
                    }
                    style={{ width: 90, color: (tx.type === "DIVIDEND" || tx.type === "DEPOSIT" || tx.type === "INTEREST") ? "var(--color-accent)" : undefined }}
                  >
                    {TYPE_LABELS[tx.type] ?? tx.type}
                  </span>
                  <span style={{ fontWeight: 600, width: 48 }}>{tx.ticker}</span>
                  {tx.shares > 0 && <span>{tx.shares}x</span>}
                  <span>${tx.price}</span>
                  <span className="text-muted">{tx.date}</span>
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
              : <><FileText size={14} />Importar {preview.valid.length} registros</>
            }
          </button>
        </div>
      )}

      {uploadResult && (
        <div className="tag tag-gain" style={{ width: "100%", flexDirection: "column", alignItems: "flex-start", gap: 4, padding: "10px 12px" }}>
          <p style={{ margin: 0, fontWeight: 600 }}>{uploadResult.imported} registros importados</p>
          {uploadResult.failed > 0 && (
            <p className="loss" style={{ fontSize: 12, margin: 0 }}>{uploadResult.failed} fallaron. Revisa los datos.</p>
          )}
        </div>
      )}
    </div>
  );
}
