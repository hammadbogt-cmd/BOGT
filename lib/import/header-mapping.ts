import { FieldSpec, TabSchema } from "./tab-schemas";

export interface ResolvedColumnMap {
  /** logical field name -> actual header text found in the source */
  map: Record<string, string>;
  missingRequired: string[];
  status: "OK" | "SOURCE_MAPPING_ISSUE";
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

  return {
    map,
    missingRequired,
    status: missingRequired.length > 0 ? "SOURCE_MAPPING_ISSUE" : "OK",
  };
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
