import { FieldSpec, TabSchema } from "./tab-schemas";

export interface ResolvedColumnMap {
  /** logical field name -> actual header text found in the source */
  map: Record<string, string>;
  missingRequired: string[];
  status: "OK" | "SOURCE_MAPPING_ISSUE";
  /** Header cells present in the sheet that no schema field claimed — shown for diagnosis, never an error. */
  unmatchedHeaders?: string[];
}

export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 %/&]/g, "");
}

/**
 * Resolves a schema's logical fields against a real header row, purely by
 * header TEXT (never column position). Missing required fields produce a
 * "SOURCE_MAPPING_ISSUE" the caller must surface rather than silently
 * importing wrong/blank data (spec section 47/29).
 */
export function resolveColumnMap(headers: string[], schema: TabSchema): ResolvedColumnMap {
  const normalizedHeaders = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }));
  const map: Record<string, string> = {};
  const missingRequired: string[] = [];

  for (const fieldSpec of schema.fields) {
    const found = findHeaderForField(normalizedHeaders, fieldSpec);
    if (found) {
      map[fieldSpec.field] = found;
    } else if (fieldSpec.required) {
      missingRequired.push(fieldSpec.field);
    }
  }

  const claimed = new Set(Object.values(map));
  const unmatchedHeaders = headers.filter((h) => h.trim() !== "" && !claimed.has(h));

  return {
    map,
    missingRequired,
    status: missingRequired.length > 0 ? "SOURCE_MAPPING_ISSUE" : "OK",
    unmatchedHeaders,
  };
}

export interface HeaderDetection {
  /** 1-based row of the sheet that turned out to hold the column headers. */
  headerRow: number;
  headers: string[];
  resolved: ResolvedColumnMap;
  /** Every row considered, so a failure can explain what it looked at. */
  attempts: { row: number; matchedFields: number; missingRequired: string[]; sample: string[] }[];
}

/**
 * Finds which row of a sheet actually holds the column headers.
 *
 * Sheets in the wild routinely open with a title, a date, or a row of
 * totals above the real header row — reading row 1 blindly then reports
 * every required column as "missing" even though the sheet is perfectly
 * fine. So: try the first few rows, score each against the schema, and use
 * the one that genuinely matches. A tie is broken in favour of the caller's
 * preferred row (the tab's saved setting) and then the earliest row.
 */
export function detectHeaderRow(
  matrix: unknown[][],
  schema: TabSchema,
  options: { preferredRow?: number; maxRowsToScan?: number } = {}
): HeaderDetection {
  const maxRowsToScan = Math.min(options.maxRowsToScan ?? 10, matrix.length);
  const attempts: HeaderDetection["attempts"] = [];
  let best: { row: number; headers: string[]; resolved: ResolvedColumnMap; matched: number } | null = null;

  for (let i = 0; i < maxRowsToScan; i++) {
    const headers = (matrix[i] as unknown[]).map((h) => String(h ?? "").trim());
    const resolved = resolveColumnMap(headers, schema);
    const matched = Object.keys(resolved.map).length;
    attempts.push({
      row: i + 1,
      matchedFields: matched,
      missingRequired: resolved.missingRequired,
      sample: headers.filter((h) => h !== "").slice(0, 12),
    });

    if (!best) {
      best = { row: i + 1, headers, resolved, matched };
      continue;
    }

    const bestComplete = best.resolved.missingRequired.length === 0;
    const thisComplete = resolved.missingRequired.length === 0;
    if (thisComplete !== bestComplete) {
      if (thisComplete) best = { row: i + 1, headers, resolved, matched };
      continue;
    }
    if (matched > best.matched) {
      best = { row: i + 1, headers, resolved, matched };
      continue;
    }
    if (matched === best.matched && options.preferredRow === i + 1) {
      best = { row: i + 1, headers, resolved, matched };
    }
  }

  if (!best) {
    return {
      headerRow: options.preferredRow ?? 1,
      headers: [],
      resolved: { map: {}, missingRequired: schema.fields.filter((f) => f.required).map((f) => f.field), status: "SOURCE_MAPPING_ISSUE", unmatchedHeaders: [] },
      attempts,
    };
  }

  return { headerRow: best.row, headers: best.headers, resolved: best.resolved, attempts };
}

function findHeaderForField(
  normalizedHeaders: { raw: string; norm: string }[],
  fieldSpec: FieldSpec
): string | null {
  const candidates = fieldSpec.headerAliases.map(normalizeHeader);
  const match = normalizedHeaders.find((h) => candidates.includes(h.norm));
  return match ? match.raw : null;
}

/** Applies a previously-resolved/stored column map to one raw row (header -> value). */
export function extractRow(rawRow: Record<string, unknown>, columnMap: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [field, header] of Object.entries(columnMap)) {
    out[field] = rawRow[header];
  }
  return out;
}
