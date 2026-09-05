import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../prisma";
import { fetchTabValues, getServiceAccountStatus } from "./google-client";
import { fromValuesMatrix } from "../import/sheet-reader";
import { resolveColumnMap } from "../import/header-mapping";
import { schemaForTargetEntity, TargetEntity } from "../import/tab-schemas";
import { runImport } from "../import/run-import";
import { ensureSheetConnectionsSeeded } from "./connections";
import { recomputeAllProducts } from "../engine/recompute";

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
 */
export async function syncWorkbook(connectionId: string, client: PrismaClient = defaultPrisma): Promise<SyncSummary> {
  const startedAt = new Date();
  const connection = await client.sheetConnection.findUniqueOrThrow({ where: { id: connectionId }, include: { tabs: true } });

  const saStatus = getServiceAccountStatus();
  if (!saStatus.configured || !connection.spreadsheetId) {
    await client.sheetConnection.update({
      where: { id: connectionId },
      data: { status: "CONNECTION_REQUIRED", lastAttemptAt: startedAt, lastError: !saStatus.configured ? "No Google service account configured" : "No spreadsheet ID configured" },
    });
    return {
      connectionId,
      workbookName: connection.workbookName,
      status: "CONNECTION_REQUIRED",
      startedAt,
      finishedAt: new Date(),
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
      errors: [!saStatus.configured ? "Google Sheets is not connected yet." : "This workbook has no Spreadsheet ID configured yet."],
    };
  }

  const summary: SyncSummary = {
    connectionId,
    workbookName: connection.workbookName,
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
  };

  for (const tab of connection.tabs) {
    try {
      const values = await fetchTabValues(connection.spreadsheetId, tab.tabName);
      const sheetData = fromValuesMatrix(values);
      const schema = schemaForTargetEntity(tab.targetEntity as TargetEntity);
      const resolved = resolveColumnMap(sheetData.headers, schema);

      if (resolved.status === "SOURCE_MAPPING_ISSUE") {
        summary.mappingErrors++;
        summary.status = "PARTIAL";
        summary.errors.push(`${tab.tabName}: missing required column(s) ${resolved.missingRequired.join(", ")}`);
        await client.sheetTabMapping.update({
          where: { id: tab.id },
          data: { status: "SOURCE_MAPPING_ISSUE", lastError: `Missing: ${resolved.missingRequired.join(", ")}` },
        });
        continue;
      }

      const result = await runImport(
        {
          targetEntity: tab.targetEntity as TargetEntity,
          sourceType: "GOOGLE_SHEETS",
          sourceName: connection.workbookName,
          sheetData,
          recomputeAfter: false, // one recompute pass at the end of the whole workbook sync, not per-tab
        },
        client
      );

      summary.tabsSynced.push(tab.tabName);
      summary.productsChecked += result.counters.rowsRead;
      summary.productsAdded += result.counters.productsAdded;
      summary.productsUpdated += result.counters.productsUpdated;
      summary.newStockInTxns += result.counters.newStockInTxns ?? 0;
      summary.newStockOutTxns += result.counters.newStockOutTxns ?? 0;
      summary.priceChanges += result.counters.priceChanges;
      summary.stockChanges += result.counters.stockChanges;
      summary.unmatchedProducts += result.counters.unmatchedProducts;
      if (result.status === "PARTIAL") summary.status = "PARTIAL";
      if (result.status === "FAILED") summary.status = summary.status === "SUCCEEDED" ? "PARTIAL" : summary.status;

      await client.sheetTabMapping.update({
        where: { id: tab.id },
        data: { status: "OK", lastError: null, lastSyncedAt: new Date(), columnMap: resolved.map },
      });
    } catch (err) {
      summary.status = "PARTIAL";
      summary.errors.push(`${tab.tabName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await recomputeAllProducts(client);

  summary.finishedAt = new Date();
  summary.durationMs = summary.finishedAt.getTime() - summary.startedAt.getTime();

  await client.sheetConnection.update({
    where: { id: connectionId },
    data: {
      status: summary.status === "CONNECTION_REQUIRED" ? "CONNECTION_REQUIRED" : summary.errors.length > 0 ? "ERROR" : "CONNECTED",
      lastAttemptAt: startedAt,
      lastSuccessfulSync: summary.status !== "CONNECTION_REQUIRED" ? summary.finishedAt : connection.lastSuccessfulSync,
      lastError: summary.errors[0] ?? null,
    },
  });

  return summary;
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
