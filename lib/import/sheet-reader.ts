import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface SheetData {
  headers: string[];
  rows: Record<string, unknown>[];
}

/**
 * Generic tabular data shape shared by CSV, XLSX, and (later) Google Sheets
 * API responses. Every importer downstream works against this shape, not
 * against a specific file format, so a supplier can hand us any of the
 * three and get identical matching/import behavior.
 */
export function readCsv(buffer: Buffer): SheetData {
  const text = buffer.toString("utf-8");
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const headers = parsed.meta.fields ?? [];
  return { headers, rows: parsed.data };
}

export function readXlsx(buffer: Buffer, sheetName?: string): SheetData {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const name = sheetName ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[name];
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found. Available sheets: ${workbook.SheetNames.join(", ")}`);
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true });
  const headers = rows.length > 0 ? Object.keys(rows[0]) : (XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] as string[] | undefined) ?? [];
  return { headers, rows };
}

/**
 * Reads an uploaded CSV as a raw grid (no header assumption), so the real
 * header row can be located before the data is interpreted.
 */
export function readCsvMatrix(buffer: Buffer): unknown[][] {
  const parsed = Papa.parse<string[]>(buffer.toString("utf-8"), { header: false, skipEmptyLines: false });
  return (parsed.data as unknown[][]) ?? [];
}

/** Same as `readCsvMatrix`, for an uploaded workbook sheet. */
export function readXlsxMatrix(buffer: Buffer, sheetName?: string): unknown[][] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const name = sheetName && workbook.SheetNames.includes(sheetName) ? sheetName : workbook.SheetNames[0];
  const sheet = workbook.Sheets[name];
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found. Available sheets: ${workbook.SheetNames.join(", ")}`);
  }
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true }) as unknown[][];
}

export function listXlsxSheetNames(buffer: Buffer): string[] {
  const workbook = XLSX.read(buffer, { type: "buffer", bookSheets: true });
  return workbook.SheetNames;
}

/**
 * Rows straight from the Google Sheets API `values.get` (array-of-arrays).
 *
 * `headerRow` is 1-based and matches `SheetTabMapping.headerRow` (default 1,
 * i.e. the first row of the tab). Some source tabs put a summary/stats row
 * above the real column headers (e.g. a workbook-totals row), so the header
 * row is configurable per tab rather than always assumed to be row 1.
 */
export function fromValuesMatrix(matrix: unknown[][], headerRow: number = 1): SheetData {
  const startIndex = Math.max(0, headerRow - 1);
  if (matrix.length <= startIndex) return { headers: [], rows: [] };
  const headers = (matrix[startIndex] as string[]).map((h) => String(h ?? "").trim());
  const rows = matrix.slice(startIndex + 1).map((row) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      if (h) obj[h] = row[i] ?? null;
    });
    return obj;
  });
  return { headers, rows };
}
