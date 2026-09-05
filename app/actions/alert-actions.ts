"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../lib/prisma";
import { requireUser } from "../../lib/auth/current-user";
import { recordAudit } from "../../lib/audit";

export interface AlertActionState {
  success?: boolean;
  error?: string;
}

/** Any logged-in user can acknowledge/resolve alerts — these are operational triage actions, not sensitive mutations. */
export async function acknowledgeAlertAction(_prev: AlertActionState, formData: FormData): Promise<AlertActionState> {
  try {
    const user = await requireUser();
    const alertId = String(formData.get("alertId"));
    const alert = await prisma.alert.findUniqueOrThrow({ where: { id: alertId } });
    if (alert.status !== "OPEN") return { error: `Alert is already ${alert.status}.` };

    await prisma.alert.update({
      where: { id: alertId },
      data: { status: "ACKNOWLEDGED", acknowledgedById: user.id, acknowledgedAt: new Date() },
    });

    await recordAudit({ userId: user.id, action: "ACKNOWLEDGE_ALERT", entityType: "Alert", entityId: alertId, source: "ui" });
    revalidatePath("/alerts");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function resolveAlertAction(_prev: AlertActionState, formData: FormData): Promise<AlertActionState> {
  try {
    const user = await requireUser();
    const alertId = String(formData.get("alertId"));
    const alert = await prisma.alert.findUniqueOrThrow({ where: { id: alertId } });
    if (alert.status === "RESOLVED") return { error: "Alert is already resolved." };

    await prisma.alert.update({ where: { id: alertId }, data: { status: "RESOLVED" } });

    await recordAudit({ userId: user.id, action: "RESOLVE_ALERT", entityType: "Alert", entityId: alertId, source: "ui" });
    revalidatePath("/alerts");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export interface RescanState extends AlertActionState {
  productsScanned?: number;
}

/** Manually re-runs the full recompute + alert-generation pass across every product (spec: alerts should be self-healing, not stale). */
export async function rescanAlertsAction(_prev: RescanState, _formData: FormData): Promise<RescanState> {
  try {
    const user = await requireUser();
    const { runFullAlertScan } = await import("../../lib/engine/alerts");
    const processed = await runFullAlertScan(prisma);

    await recordAudit({ userId: user.id, action: "RESCAN_ALERTS", entityType: "System", entityId: "alerts", newValue: { processed }, source: "ui" });
    revalidatePath("/alerts");
    return { success: true, productsScanned: processed };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
