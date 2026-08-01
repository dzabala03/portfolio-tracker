// ─────────────────────────────────────────────────────────────
// TRM CLIENT — Tasa Representativa del Mercado (Colombia)
//
// Fuente: datos.gov.co, dataset oficial de la Superintendencia
// Financiera de Colombia (dataset mcec-87by). Gratis, sin API key.
//
// La TRM se calcula con las operaciones del día anterior y aplica
// para el día siguiente; en fines de semana/feriados el mismo valor
// puede cubrir varios días ("vigenciadesde".."vigenciahasta"). Por
// eso se pide DESC + un límite chico y se toma la primera fila como
// "la TRM vigente hoy" y la SIGUIENTE fila distinta como "la anterior",
// en vez de asumir que ayer tiene su propia fila siempre.
// ─────────────────────────────────────────────────────────────

const TRM_DATASET_URL = "https://www.datos.gov.co/resource/mcec-87by.json";

interface TrmRow {
  valor: string;
  unidad: string;
  vigenciadesde: string;
  vigenciahasta: string;
}

export interface TrmQuote {
  value: number;
  previousValue: number;
  change: number;
  changePct: number;
  date: string; // "YYYY-MM-DD" — vigenciadesde de la fila actual
}

export async function fetchTRM(): Promise<TrmQuote> {
  const url = `${TRM_DATASET_URL}?$order=vigenciadesde DESC&$limit=5`;
  const res = await fetch(url, {
    next: { revalidate: 3600 }, // la TRM cambia una vez al día — 1h de caché es de sobra
  });
  if (!res.ok) throw new Error(`[TRM] fetchTRM: HTTP ${res.status}`);

  const rows: TrmRow[] = await res.json();
  if (rows.length === 0) throw new Error("[TRM] fetchTRM: dataset vacío");

  const current = rows[0];
  const previous = rows.find((r) => r.valor !== current.valor) ?? rows[1] ?? current;

  const value = parseFloat(current.valor);
  const previousValue = parseFloat(previous.valor);

  return {
    value,
    previousValue,
    change: value - previousValue,
    changePct: previousValue !== 0 ? ((value - previousValue) / previousValue) * 100 : 0,
    date: current.vigenciadesde.slice(0, 10),
  };
}

export interface TrmPoint {
  date: string;   // "YYYY-MM-DD"
  value: number;
}

// TRM día por día para un rango — cada fila del dataset cubre un
// intervalo [vigenciadesde, vigenciahasta] (los fines de semana quedan
// dentro del intervalo del viernes), así que se expande cada fila a un
// punto por día calendario para poder cruzarla 1:1 contra la serie de
// valor del portafolio (que también es diaria).
export async function fetchTRMSeries(fromISO: string, toISO: string): Promise<TrmPoint[]> {
  const params = new URLSearchParams({
    "$where": `vigenciadesde <= '${toISO}T00:00:00.000' AND vigenciahasta >= '${fromISO}T00:00:00.000'`,
    "$order": "vigenciadesde ASC",
    "$limit": "1000",
  });
  const res = await fetch(`${TRM_DATASET_URL}?${params.toString()}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`[TRM] fetchTRMSeries: HTTP ${res.status}`);

  const rows: TrmRow[] = await res.json();
  const points: TrmPoint[] = [];

  for (const row of rows) {
    const value = parseFloat(row.valor);
    const d = new Date(`${row.vigenciadesde.slice(0, 10)}T00:00:00Z`);
    const end = new Date(`${row.vigenciahasta.slice(0, 10)}T00:00:00Z`);
    while (d <= end) {
      const iso = d.toISOString().slice(0, 10);
      if (iso >= fromISO && iso <= toISO) points.push({ date: iso, value });
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }
  return points;
}
