"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "../../lib/auth/current-user";
import { updateSettings, getSettings } from "../../lib/settings-store";
import { recomputeAllProducts } from "../../lib/engine/recompute";
import { recordAudit } from "../../lib/audit";
import { SETTING_FIELDS, parseFieldValue } from "../../lib/settings-fields";
import type { BusinessSettings } from "../../lib/calc/settings";

export interface UpdateSettingsState {
  success?: boolean;
  error?: string;
  recomputedCount?: number;
}

/**
 * Saves business-rule settings (spec section 34) and immediately recomputes
 * every product so the new thresholds take effect without a deploy (spec
 * section 13: recalculate automatically whenever a rule changes).
 */
export async function updateSettingsAction(
  _prev: UpdateSettingsState,
  formData: FormData
): Promise<UpdateSettingsState> {
  try {
    const user = await requirePermission("manage_settings");

    const patch: Partial<BusinessSettings> = {};
    for (const field of SETTING_FIELDS) {
      const raw = formData.get(field.key);
      if (field.type === "bool") {
        (patch as Record<string, unknown>)[field.key] = raw === "on" || raw === "true";
        continue;
      }
      if (raw == null || raw === "") continue;
      const parsed = parseFieldValue(field, String(raw));
      if (typeof parsed === "number" && !Number.isFinite(parsed)) {
        return { error: `Invalid value for "${field.label}".` };
      }
      (patch as Record<string, unknown>)[field.key] = parsed;
    }

    const before = await getSettings();
    const next = await updateSettings(patch, user.id);

    await recordAudit({
      userId: user.id,
      action: "UPDATE_SETTINGS",
      entityType: "Setting",
      entityId: "business_rules",
      oldValue: before as unknown as Record<string, unknown>,
      newValue: next as unknown as Record<string, unknown>,
      source: "ui",
    });

    const recomputedCount = await recomputeAllProducts();

    revalidatePath("/settings");
    revalidatePath("/dashboard");
    revalidatePath("/reorder-center");
    revalidatePath("/products");
    revalidatePath("/inventory/amazon");
    revalidatePath("/inventory/warehouse");

    return { success: true, recomputedCount };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
