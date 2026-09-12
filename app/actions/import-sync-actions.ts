"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../lib/prisma";
import { requirePermission } from "../../lib/auth/current-user";
import { recordAudit } from "../../lib/audit";
import { runImport, type RunImportResult } from "../../lib/import/run-import";
import type { TargetEntity } from "../../lib/import/tab-schemas";

export interface ManualImportState {
  success?: boolean;
  error?: string;
  result?: RunImportResult;
}

/** Manual CSV/XLSX upload for one of the two canonical workbook tabs — the same pipeline the Google Sheets sync uses. */
export async function manualImportAction(_prev: ManualImportState, formData: FormData): Promise<ManualImportState> {
  try {
    const user = await requirePermission("run_sheet_sync");
    const targetEntity = String(formData.get("targetEntity")) as TargetEntity;
    const workbookName = String(formData.get("workbookName") ?? "Manual Upload");
    const file = formData.get("file");

    if (!targetEntity) return { error: "Choose which tab this file corresponds to." };
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };

    const buffer = Buffer.from(await file.arrayBuffer());
    const isXlsx = /\.xlsx?$/i.test(file.name) || file.type.includes("spreadsheet") || file.type.includes("excel");

    const result = await runImport({
      targetEntity,
      sourceType: isXlsx ? "XLSX" : "CSV",
      sourceName: `${workbookName} — ${file.name}`,
      buffer,
      triggeredById: user.id,
    });

    await recordAudit({
      userId: user.id,
      action: "MANUAL_IMPORT",
      entityType: "ImportJob",
      entityId: result.importJobId,
      newValue: { targetEntity, fileName: file.name, status: result.status, counters: result.counters },
      source: "import",
    });

    revalidatePath("/import-sync");
    revalidatePath("/dashboard");
    revalidatePath("/reorder-center");
    return { success: result.status !== "FAILED", result, error: result.status === "FAILED" ? "Import failed — see the mapping issue below." : undefined };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export interface ConnectionConfigState {
  success?: boolean;
  error?: string;
}

/** Sets/updates the Spreadsheet ID for a workbook connection ("Repair Mapping" — spec section 48). */
export async function setSpreadsheetIdAction(_prev: ConnectionConfigState, formData: FormData): Promise<ConnectionConfigState> {
  try {
    const user = await requirePermission("run_sheet_sync");
    const connectionId = String(formData.get("connectionId"));
    const spreadsheetId = String(formData.get("spreadsheetId") ?? "").trim();

    const connection = await prisma.sheetConnection.findUniqueOrThrow({ where: { id: connectionId } });
    await prisma.sheetConnection.update({
      where: { id: connectionId },
      data: {
        spreadsheetId: spreadsheetId || null,
        status: spreadsheetId ? "CONNECTION_REQUIRED" : "NOT_CONFIGURED", // proven CONNECTED only after a real successful sync
        lastError: null,
      },
    });

    await recordAudit({
      userId: user.id,
      action: "SET_SHEET_SPREADSHEET_ID",
      entityType: "SheetConnection",
      entityId: connectionId,
      oldValue: { spreadsheetId: connection.spreadsheetId },
      newValue: { spreadsheetId },
      source: "ui",
    });

    revalidatePath("/import-sync");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export interface TabConfigState {
  success?: boolean;
  error?: string;
}

/**
 * Sets which row of a source tab actually holds the column headers (1-based).
 * Some tabs (e.g. a workbook with a totals/summary row above the real
 * header row) need this to be 2 or higher — without it the importer reads
 * the summary row as headers and every required column looks "missing".
 */
export async function setHeaderRowAction(_prev: TabConfigState, formData: FormData): Promise<TabConfigState> {
  try {
    const user = await requirePermission("run_sheet_sync");
    const tabId = String(formData.get("tabId"));
    const headerRowRaw = Number(formData.get("headerRow"));
    const headerRow = Number.isFinite(headerRowRaw) && headerRowRaw >= 1 ? Math.floor(headerRowRaw) : 1;

    const tab = await prisma.sheetTabMapping.findUniqueOrThrow({ where: { id: tabId } });
    await prisma.sheetTabMapping.update({
      where: { id: tabId },
      data: { headerRow, lastError: null },
    });

    await recordAudit({
      userId: user.id,
      action: "SET_SHEET_HEADER_ROW",
      entityType: "SheetTabMapping",
      entityId: tabId,
      oldValue: { headerRow: tab.headerRow },
      newValue: { headerRow },
      source: "ui",
    });

    revalidatePath("/import-sync");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export interface AutoSyncState {
  success?: boolean;
  error?: string;
}

export async function setAutoSyncAction(_prev: AutoSyncState, formData: FormData): Promise<AutoSyncState> {
  try {
    const user = await requirePermission("run_sheet_sync");
    const connectionId = String(formData.get("connectionId"));
    const autoSyncEnabled = formData.get("autoSyncEnabled") === "true";
    const autoSyncInterval = String(formData.get("autoSyncInterval") ?? "MANUAL_ONLY");

    await prisma.sheetConnection.update({ where: { id: connectionId }, data: { autoSyncEnabled, autoSyncInterval } });

    await recordAudit({
      userId: user.id,
      action: "SET_AUTO_SYNC",
      entityType: "SheetConnection",
      entityId: connectionId,
      newValue: { autoSyncEnabled, autoSyncInterval },
      source: "ui",
    });

    revalidatePath("/import-sync");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
