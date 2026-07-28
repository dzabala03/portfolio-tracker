"use client";

import { useState, useRef } from "react";
import Papa from "papaparse";
import type { NewTransaction, TransactionType, CsvImportResult } from "@/types";
import { clsx } from "clsx";
import { Upload, AlertCircle, CheckCircle, Loader2, FileText } from "lucide-react";

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
  const [month, day, year] = parts;
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
    <div className="space-y-4">
      {/* Drop area */}
      <div
        className={clsx(
          "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
          "border-border hover:border-accent/50 hover:bg-accent-subtle"
        )}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
        role="button" tabIndex={0} aria-label="Seleccionar archivo CSV"
      >
        <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileChange} className="hidden" aria-hidden="true" />
        <Upload size={24} className="mx-auto mb-3 text-text-muted" />
        <p className="text-text-secondary text-sm font-medium">
          {fileName ?? "Arrastra un CSV o haz clic para seleccionar"}
        </p>
        <p className="text-text-muted text-xs mt-1">Soporta el formato de tu broker y el formato estándar</p>
      </div>

      {/* Formato detectado */}
      {detectedFormat && (
        <div className="bg-accent-subtle border border-accent/20 rounded-lg px-4 py-2">
          <p className="text-accent text-xs">
            {detectedFormat === "broker"
              ? "✓ Formato de broker detectado — columnas mapeadas automáticamente"
              : "✓ Formato estándar detectado"}
          </p>
        </div>
      )}

      {/* Vista previa */}
      {preview && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="flex items-center gap-1.5 text-gain">
              <CheckCircle size={14} />{preview.valid.length} válidas
            </span>
            {preview.skipped > 0 && (
              <span className="text-text-muted text-xs">{preview.skipped} ignoradas (journal/transfer)</span>
            )}
            {preview.errors.length > 0 && (
              <span className="flex items-center gap-1.5 text-loss">
                <AlertCircle size={14} />{preview.errors.length} errores
              </span>
            )}
          </div>

          {preview.errors.length > 0 && (
            <div className="bg-loss-subtle border border-loss/20 rounded-lg p-3 space-y-1 max-h-32 overflow-y-auto">
              {preview.errors.map((err) => (
                <p key={err.row} className="text-loss text-xs">Fila {err.row}: {err.message}</p>
              ))}
            </div>
          )}

          {preview.valid.length > 0 && (
            <div className="bg-elevated rounded-lg p-3 space-y-1.5 max-h-48 overflow-y-auto">
              <p className="label mb-2">Vista previa</p>
              {preview.valid.slice(0, 6).map((tx, i) => (
                <div key={i} className="flex gap-3 text-xs font-finance">
                  <span className={clsx(
                    "w-20",
                    tx.type === "BUY" ? "text-gain" :
                    tx.type === "SELL" ? "text-loss" :
                    tx.type === "DIVIDEND" || tx.type === "DEPOSIT" || tx.type === "INTEREST" ? "text-accent" :
                    "text-text-muted"
                  )}>
                    {TYPE_LABELS[tx.type] ?? tx.type}
                  </span>
                  <span className="text-text-primary font-semibold w-12">{tx.ticker}</span>
                  {tx.shares > 0 && <span className="text-text-secondary">{tx.shares}x</span>}
                  <span className="text-text-secondary">${tx.price}</span>
                  <span className="text-text-muted">{tx.date}</span>
                </div>
              ))}
              {preview.valid.length > 6 && (
                <p className="text-text-muted text-xs">y {preview.valid.length - 6} más...</p>
              )}
            </div>
          )}

          <button
            onClick={handleImport}
            disabled={isUploading || preview.valid.length === 0}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {isUploading
              ? <><Loader2 size={14} className="animate-spin" />Importando...</>
              : <><FileText size={14} />Importar {preview.valid.length} registros</>
            }
          </button>
        </div>
      )}

      {uploadResult && (
        <div className="bg-gain-subtle border border-gain/20 rounded-lg px-4 py-3">
          <p className="text-gain text-sm font-medium">✓ {uploadResult.imported} registros importados</p>
          {uploadResult.failed > 0 && (
            <p className="text-loss text-xs mt-1">{uploadResult.failed} fallaron. Revisa los datos.</p>
          )}
        </div>
      )}
    </div>
  );
}
