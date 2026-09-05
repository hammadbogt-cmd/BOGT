/**
 * Tolerant value parsers for spreadsheet cells, which arrive as strings,
 * numbers, blanks, or Excel date serials depending on the source.
 */

export function parseNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value)
    .replace(/[, ]/g, "")
    .replace(/AED|USD|\$|%/gi, "")
    .trim();
  if (cleaned === "" || cleaned === "-" || cleaned.toUpperCase() === "N/A") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseIntOrNull(value: unknown): number | null {
  const n = parseNumberOrNull(value);
  return n === null ? null : Math.round(n);
}

export function parseStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30); // Excel's day-0, accounting for the 1900 leap-year bug

export function parseDateOrNull(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  if (typeof value === "number") {
    // Excel/Sheets serial date number
    const ms = EXCEL_EPOCH_MS + value * 24 * 60 * 60 * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const str = String(value).trim();
  if (str === "") return null;

  // Try common explicit formats first: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const [, d, m, yRaw] = dmy;
    const y = yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw);
    const date = new Date(Date.UTC(y, Number(m) - 1, Number(d)));
    if (!Number.isNaN(date.getTime())) return date;
  }

  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
