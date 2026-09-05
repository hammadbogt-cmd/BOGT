"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "../../lib/auth/current-user";
import { syncAllWorkbooks, syncWorkbook, type SyncSummary } from "../../lib/sheets/sync";
import { recordAudit } from "../../lib/audit";

export interface SyncActionState {
  results?: SyncSummary[];
  error?: string;
  ranAt?: string;
}

/** The "SYNC ALL LATEST DATA" button (spec section 48). */
export async function syncAllAction(_prev: SyncActionState): Promise<SyncActionState> {
  try {
    const user = await requirePermission("run_sheet_sync");
    const results = await syncAllWorkbooks();
    await recordAudit({ userId: user.id, action: "SHEET_SYNC_ALL", entityType: "SheetConnection", newValue: results, source: "sync" });
    revalidatePath("/dashboard");
    revalidatePath("/import-sync");
    return { results, ranAt: new Date().toISOString() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function syncOneWorkbookAction(_prev: SyncActionState, formData: FormData): Promise<SyncActionState> {
  try {
    const user = await requirePermission("run_sheet_sync");
    const connectionId = String(formData.get("connectionId"));
    const result = await syncWorkbook(connectionId);
    await recordAudit({ userId: user.id, action: "SHEET_SYNC_ONE", entityType: "SheetConnection", entityId: connectionId, newValue: result, source: "sync" });
    revalidatePath("/dashboard");
    revalidatePath("/import-sync");
    return { results: [result], ranAt: new Date().toISOString() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
