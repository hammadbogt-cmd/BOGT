import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../prisma";
import { fetchTabValues, getServiceAccountStatus } from "./google-client";
import { fromValuesMatrix } from "../import/sheet-reader";
import { detectHeaderRow } from "../import/header-mapping";
import { schemaForTargetEntity, TargetEntity } from "../import/tab-schemas";
import { runImport } from "../import/run-import";
import { ensureSheetConnectionsSeeded } from "./connections";
import { recomputeProducts } from "../engine/recompute";

/** Everything the Import & Sync screen needs to explain what happened to one tab. */
export interface TabSyncDetail {
  tabName: string;
  status: "OK" | "SOURCE_MAPPING_ISSUE" | "FAILED" | "SKIPPED";
  durationMs: number;
  /** Row of the sheet the headers were found on (1 unless the sheet has a banner/totals row). */
  headerRow?: number;
  rowsRead: number;
  rowsCreated: number;
  rowsUpdated: number;
  rowsSkipped: number;
  errorCount: number;
  unmatchedProducts: number;
  /** Logical field -> the sheet column it was read from. */
  mappedColumns?: Record<string, string>;
  /** Columns present in the sheet that this tab's mapping does not use. */
  unmatchedHeaders?: string[];
  missingRequired?: string[];
  headersSeen?: string[];
  error?: string;
  /** First few row-level problems, so a bad row can be found without opening logs. */
  sampleRowErrors?: { rowNumber: number; message: string }[];
}

export interface SyncSummary {
  connectionId: string;
  workbookName: string;
  status: "SUCCEEDED" | "FAILED" | "PARTIAL" | "CONNECTION_REQUIRED";
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  tabsSynced: string[];
  productsChecked: number;
  productsAdded: number;
  productsUpdated: number;
  newStockInTxns: number;
  newStockOutTxns: number;
  priceChanges: number;
  stockChanges: number;
  mappingErrors: number;
  unmatchedProducts: number;
  errors: string[];
  /** Per-tab breakdown — the detail the UI shows under each workbook. */
  tabs: TabSyncDetail[];
  /** How long the post-sync recalculation took, and how many products it covered. */
  recomputedProducts?: number;
  recomputeMs?: number;
}

/**
 * SYNC ALL LATEST DATA (spec section 48). Pulls every configured tab from a
 * workbook via the Google Sheets API, runs it through the SAME import
 * pipeline used for manual CSV/XLSX uploads (identical matching + idempotent
 * transaction fingerprints — clicking Sync repeatedly never duplicates
 * data), and returns the full "SYNC COMPLETED" summary the Dashboard and
 * Data Connections page display.
 *
 * Stays cleanly in CONNECTION_REQUIRED until a service account + spreadsheet
 * ID are configured — it never fabricates a "just synced" result from stale
 * data.
 *
 * One tab failing never aborts the rest: each is reported on its own, with
 * the header row used, the columns matched, and the first row errors, so a
 * problem can be diagnosed from the screen instead of from server logs.
 */
export async function syncWorkbook(connectionId: string, client: PrismaClient = defaultPrisma): Promise<SyncSummary> {
  const startedAt = new Date();
  const connection = await client.sheetConnection.findUniqueOrThrow({ where: { id: connectionId }, include: { tabs: true } });

  const saStatus = getServiceAccountStatus();
  if (!saStatus.configured || !connection.spreadsheetId) {
    const reason = !saStatus.configured
      ? saStatus.error
        ? `Google service account is not usable: ${saStatus.error}`
        : "No Google service account configured"
      : "No spreadsheet ID configured";
    await client.sheetConnection.update({
      where: { id: connectionId },
      data: { status: "CONNECTION_REQUIRED", lastAttemptAt: startedAt, lastError: reason },
    });
    return {
      ...blankSummary(connectionId, connection.workbookName, startedAt),
      status: "CONNECTION_REQUIRED",
      errors: [
        !saStatus.configured
          ? "Google Sheets is not connected yet — add the service account key, then share both spreadsheets with that service account email."
          : "This workbook has no Spreadsheet ID configured yet — paste just the ID from the sheet URL (the part between /d/ and /edit).",
      ],
    };
  }

  const summary: SyncSummary = { ...blankSummary(connectionId, connection.workbookName, startedAt), status: "SUCCEEDED" };
  const touchedProductIds = new Set<string>();

  for (const tab of connection.tabs) {
    const tabStart = Date.now();
    const detail: TabSyncDetail = {
      tabName: tab.tabName,
      status: "OK",
      durationMs: 0,
      rowsRead: 0,
      rowsCreated: 0,
      rowsUpdated: 0,
      rowsSkipped: 0,
      errorCount: 0,
      unmatchedProducts: 0,
    };

    try {
      const schema = schemaForTargetEntity(tab.targetEntity as TargetEntity);
      const values = await fetchTabValues(connection.spreadsheetId, tab.tabName);

      if (values.length === 0) {
        detail.status = "SKIPPED";
        detail.error = "The tab is empty (no rows returned).";
        summary.status = "PARTIAL";
        summary.errors.push(`${tab.tabName}: the tab is empty.`);
        await client.sheetTabMapping.update({ where: { id: tab.id }, data: { status: "SOURCE_MAPPING_ISSUE", lastError: detail.error } });
        continue;
      }

      // Find the row that actually holds the headers — some tabs open with a
      // date/totals banner above them.
      const detection = detectHeaderRow(values, schema, { preferredRow: tab.headerRow });
      detail.headerRow = detection.headerRow;
      detail.headersSeen = detection.headers.filter((h) => h !== "");
      detail.mappedColumns = detection.resolved.map;
      detail.unmatchedHeaders = detection.resolved.unmatchedHeaders;

      if (detection.resolved.status === "SOURCE_MAPPING_ISSUE") {
        detail.status = "SOURCE_MAPPING_ISSUE";
        detail.missingRequired = detection.resolved.missingRequired;
        summary.mappingErrors++;
        summary.status = "PARTIAL";
        const message = `${tab.tabName}: could not find column(s) ${detection.resolved.missingRequired.join(
          ", "
        )}. Looked at row ${detection.headerRow}, which reads: ${detail.headersSeen.slice(0, 12).join(" | ") || "(blank)"}`;
        summary.errors.push(message);
        await client.sheetTabMapping.update({
          where: { id: tab.id },
          data: {
            status: "SOURCE_MAPPING_ISSUE",
            headerRow: detection.headerRow,
            lastError: `Missing: ${detection.resolved.missingRequired.join(", ")} (checked row ${detection.headerRow})`,
          },
        });
        continue;
      }

      const sheetData = fromValuesMatrix(values, detection.headerRow);
      const result = await runImport(
        {
          targetEntity: tab.targetEntity as TargetEntity,
          sourceType: "GOOGLE_SHEETS",
          sourceName: connection.workbookName,
          sheetData,
          headerRow: detection.headerRow,
          recomputeAfter: false, // one recompute pass at the end of the whole workbook sync, not per-tab
        },
        client
      );

      for (const id of result.counters.touchedProductIds ?? []) touchedProductIds.add(id);

      detail.rowsRead = result.counters.rowsRead;
      detail.rowsCreated = result.counters.rowsCreated;
      detail.rowsUpdated = result.counters.rowsUpdated;
      detail.rowsSkipped = result.counters.rowsSkipped;
      detail.errorCount = result.counters.errorCount;
      detail.unmatchedProducts = result.counters.unmatchedProducts;
      detail.sampleRowErrors = result.counters.rowErrors.slice(0, 5);

      summary.tabsSynced.push(tab.tabName);
      summary.productsChecked += result.counters.rowsRead;
      summary.productsAdded += result.counters.productsAdded;
      summary.productsUpdated += result.counters.productsUpdated;
      summary.newStockInTxns += result.counters.newStockInTxns ?? 0;
      summary.newStockOutTxns += result.counters.newStockOutTxns ?? 0;
      summary.priceChanges += result.counters.priceChanges;
      summary.stockChanges += result.counters.stockChanges;
      summary.unmatchedProducts += result.counters.unmatchedProducts;

      if (result.status === "PARTIAL" || result.status === "FAILED") {
        summary.status = "PARTIAL";
        detail.status = "FAILED";
        const firstError = result.counters.rowErrors[0];
        summary.errors.push(
          `${tab.tabName}: ${result.counters.errorCount} row(s) failed${firstError ? ` — e.g. row ${firstError.rowNumber}: ${firstError.message}` : ""}`
        );
      }

      await client.sheetTabMapping.update({
        where: { id: tab.id },
        data: {
          status: detail.status === "OK" ? "OK" : "SOURCE_MAPPING_ISSUE",
          headerRow: detection.headerRow,
          lastError:
            detail.status === "OK"
              ? null
              : `${result.counters.errorCount} row(s) failed — first: ${result.counters.rowErrors[0]?.message ?? "unknown"}`,
          lastSyncedAt: new Date(),
          columnMap: detection.resolved.map,
        },
      });
    } catch (err) {
      const message = describeSyncError(err, tab.tabName, connection.spreadsheetId);
      detail.status = "FAILED";
      detail.error = message;
      summary.status = "PARTIAL";
      summary.errors.push(`${tab.tabName}: ${message}`);
      await client.sheetTabMapping.update({ where: { id: tab.id }, data: { status: "SOURCE_MAPPING_ISSUE", lastError: message } });
    } finally {
      detail.durationMs = Date.now() - tabStart;
      summary.tabs.push(detail);
    }
  }

  const recomputeStart = Date.now();
  summary.recomputedProducts = await recomputeProducts([...touchedProductIds], client);
  summary.recomputeMs = Date.now() - recomputeStart;

  summary.finishedAt = new Date();
  summary.durationMs = summary.finishedAt.getTime() - summary.startedAt.getTime();

  if (summary.tabsSynced.length === 0 && summary.tabs.length > 0) summary.status = "FAILED";

  await client.sheetConnection.update({
    where: { id: connectionId },
    data: {
      status: summary.status === "CONNECTION_REQUIRED" ? "CONNECTION_REQUIRED" : summary.errors.length > 0 ? "ERROR" : "CONNECTED",
      lastAttemptAt: startedAt,
      lastSuccessfulSync: summary.tabsSynced.length > 0 ? summary.finishedAt : connection.lastSuccessfulSync,
      lastError: summary.errors[0] ?? null,
    },
  });

  return summary;
}

/** Turns Google API failures into something a human can act on. */
function describeSyncError(err: unknown, tabName: string, spreadsheetId: string | null): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/Unable to parse range|Requested entity was not found/i.test(raw)) {
    return `The tab "${tabName}" was not found in spreadsheet ${spreadsheetId ?? "(none)"}. Check the tab name matches exactly (including spaces), and that the Spreadsheet ID is just the ID from the URL.`;
  }
  if (/permission|forbidden|403/i.test(raw)) {
    return `Access denied. Share the spreadsheet with the service account email (Viewer access is enough), then sync again. [${raw}]`;
  }
  if (/quota|rate limit|429/i.test(raw)) {
    return `Google rate-limited the request. Wait a minute and sync again. [${raw}]`;
  }
  return raw;
}

function blankSummary(connectionId: string, workbookName: string, startedAt: Date): SyncSummary {
  return {
    connectionId,
    workbookName,
    status: "SUCCEEDED",
    startedAt,
    finishedAt: startedAt,
    durationMs: 0,
    tabsSynced: [],
    productsChecked: 0,
    productsAdded: 0,
    productsUpdated: 0,
    newStockInTxns: 0,
    newStockOutTxns: 0,
    priceChanges: 0,
    stockChanges: 0,
    mappingErrors: 0,
    unmatchedProducts: 0,
    errors: [],
    tabs: [],
  };
}

/** "SYNC ALL LATEST DATA" — the single Dashboard button (spec section 48). */
export async function syncAllWorkbooks(client: PrismaClient = defaultPrisma): Promise<SyncSummary[]> {
  await ensureSheetConnectionsSeeded(client);
  const connections = await client.sheetConnection.findMany();
  const results: SyncSummary[] = [];
  for (const connection of connections) {
    results.push(await syncWorkbook(connection.id, client));
  }
  return results;
}
