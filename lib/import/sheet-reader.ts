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

export function listXlsxSheetNames(buffer: Buffer): string[] {
  const workbook = XLSX.read(buffer, { type: "buffer", bookSheets: true });
  return workbook.SheetNames;
}

/** Rows straight from the Google Sheets API `values.get` (array-of-arrays, first row = headers). */
export function fromValuesMatrix(matrix: unknown[][]): SheetData {
  if (matrix.length === 0) return { headers: [], rows: [] };
  const headers = (matrix[0] as string[]).map((h) => String(h ?? "").trim());
  const rows = matrix.slice(1).map((row) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      if (h) obj[h] = row[i] ?? null;
    });
    return obj;
  });
  return { headers, rows };
}
