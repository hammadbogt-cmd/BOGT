import type { PrismaClient } from "@prisma/client";

/**
 * Bulk write helpers.
 *
 * A workbook sync touches thousands of rows. Issuing one statement per row
 * means thousands of sequential network round trips to a hosted database,
 * which is minutes of latency and — inside a serverless request with a hard
 * time limit — a failed sync rather than a slow one. These helpers collapse
 * a whole batch into a single statement by shipping the rows as one JSON
 * parameter and letting Postgres expand it with `json_to_recordset`.
 *
 * Everything here is plain SQL against the tables Prisma manages; no schema
 * change and no behavioural change beyond doing the same writes together.
 */

export interface BulkColumn {
  /** Database column name, exactly as spelled in the schema. */
  name: string;
  /** Type used when expanding the JSON payload (e.g. "text", "integer", "numeric", "boolean", "timestamp"). */
  type: string;
  /** Optional cast applied on assignment, for enum columns (e.g. `"ListingStatus"`). */
  cast?: string;
}

function quote(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function recordsetDefinition(idColumn: BulkColumn, columns: BulkColumn[]): string {
  return [idColumn, ...columns].map((c) => `${quote(c.name)} ${c.type}`).join(", ");
}

/**
 * `UPDATE <table> SET ... FROM json_to_recordset(...)` — one statement for
 * the whole batch, matched on `id`. Rows must each carry `id` plus every
 * column listed (use `null` for "no value"); a column absent from a row
 * would otherwise read as SQL NULL and blank the stored value.
 */
export async function bulkUpdateById(
  prisma: PrismaClient,
  table: string,
  columns: BulkColumn[],
  rows: Record<string, unknown>[],
  chunkSize = 500
): Promise<number> {
  if (rows.length === 0 || columns.length === 0) return 0;
  const idColumn: BulkColumn = { name: "id", type: "text" };
  const assignments = columns
    .map((c) => `${quote(c.name)} = v.${quote(c.name)}${c.cast ? `::${c.cast}` : ""}`)
    .join(", ");
  const sql = `UPDATE ${quote(table)} AS t SET ${assignments} FROM json_to_recordset($1::json) AS v(${recordsetDefinition(
    idColumn,
    columns
  )}) WHERE t."id" = v."id"`;

  let affected = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    affected += await prisma.$executeRawUnsafe(sql, JSON.stringify(chunk));
  }
  return affected;
}

/**
 * `INSERT ... ON CONFLICT (...) DO UPDATE` for a whole batch in one
 * statement — the bulk equivalent of calling `upsert` per row.
 */
export async function bulkUpsert(
  prisma: PrismaClient,
  table: string,
  conflictColumns: string[],
  columns: BulkColumn[],
  rows: Record<string, unknown>[],
  options: { updateColumns?: string[]; chunkSize?: number } = {}
): Promise<number> {
  if (rows.length === 0) return 0;
  const chunkSize = options.chunkSize ?? 500;
  const updateColumns = options.updateColumns ?? columns.filter((c) => !conflictColumns.includes(c.name)).map((c) => c.name);
  const insertList = columns.map((c) => quote(c.name)).join(", ");
  const selectList = columns.map((c) => `v.${quote(c.name)}${c.cast ? `::${c.cast}` : ""}`).join(", ");
  const conflictList = conflictColumns.map(quote).join(", ");
  const doUpdate =
    updateColumns.length > 0
      ? `DO UPDATE SET ${updateColumns.map((c) => `${quote(c)} = EXCLUDED.${quote(c)}`).join(", ")}`
      : "DO NOTHING";
  const definition = columns.map((c) => `${quote(c.name)} ${c.type}`).join(", ");
  const sql = `INSERT INTO ${quote(table)} (${insertList}) SELECT ${selectList} FROM json_to_recordset($1::json) AS v(${definition}) ON CONFLICT (${conflictList}) ${doUpdate}`;

  let affected = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    affected += await prisma.$executeRawUnsafe(sql, JSON.stringify(rows.slice(i, i + chunkSize)));
  }
  return affected;
}

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Generates an id in the same shape Prisma's `cuid()` default produces, so
 * rows written in bulk (which must know their ids up front, to avoid a
 * read-back round trip) look no different from rows written one at a time.
 */
export function newId(): string {
  let random = "";
  for (let i = 0; i < 16; i++) random += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
  return `c${Date.now().toString(36)}${random}`;
}
