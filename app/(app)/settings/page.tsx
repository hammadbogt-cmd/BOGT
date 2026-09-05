import { getSettings } from "../../../lib/settings-store";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { can } from "../../../lib/auth/permissions";
import { SETTING_FIELDS, fieldFormValue } from "../../../lib/settings-fields";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, user] = await Promise.all([getSettings(), getCurrentUser()]);
  const canEdit = !!user && can(user.role, "manage_settings");

  const values: Record<string, string> = {};
  for (const field of SETTING_FIELDS) {
    values[field.key] = fieldFormValue(settings, field);
  }

  const groupOrder = [...new Set(SETTING_FIELDS.map((f) => f.group))];
  const groups = groupOrder.map((group) => ({ group, fields: SETTING_FIELDS.filter((f) => f.group === group) }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">
          Every threshold that drives the reorder engine, profitability calculations, and stock-status classification —
          nothing here is hardcoded. Saving recalculates every product immediately.
        </p>
      </div>

      <SettingsForm groups={groups} values={values} canEdit={canEdit} />
    </div>
  );
}
