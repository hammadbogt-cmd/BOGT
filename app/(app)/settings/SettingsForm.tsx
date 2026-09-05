"use client";

import { useActionState } from "react";
import { updateSettingsAction, type UpdateSettingsState } from "../../actions/settings-actions";
import type { SettingFieldDef } from "../../../lib/settings-fields";

const initialState: UpdateSettingsState = {};

export function SettingsForm({
  groups,
  values,
  canEdit,
}: {
  groups: { group: string; fields: SettingFieldDef[] }[];
  values: Record<string, string>;
  canEdit: boolean;
}) {
  const [state, formAction, isPending] = useActionState(updateSettingsAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {!canEdit && (
        <div className="rounded-md bg-yellow-50 p-3 text-sm text-yellow-800 ring-1 ring-inset ring-yellow-200">
          Your role can view these settings but cannot change them. Only Admins can edit business rules.
        </div>
      )}

      {groups.map((g) => (
        <div key={g.group} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">{g.group}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {g.fields.map((field) => (
              <div key={field.key} className="flex flex-col gap-1">
                <label htmlFor={field.key} className="text-xs font-medium text-slate-600">
                  {field.label}
                  {field.type === "percent" && <span className="text-slate-400"> (%)</span>}
                </label>
                {field.type === "bool" ? (
                  <label className="mt-1 inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      id={field.key}
                      name={field.key}
                      defaultChecked={values[field.key] === "true"}
                      disabled={!canEdit}
                      className="h-4 w-4"
                    />
                    Enabled
                  </label>
                ) : field.type === "coverage_days" ? (
                  <select
                    id={field.key}
                    name={field.key}
                    defaultValue={values[field.key]}
                    disabled={!canEdit}
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50"
                  >
                    <option value="30">30 days</option>
                    <option value="60">60 days</option>
                  </select>
                ) : (
                  <input
                    id={field.key}
                    name={field.key}
                    type="number"
                    step={field.type === "int" ? 1 : "any"}
                    defaultValue={values[field.key]}
                    disabled={!canEdit}
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:bg-slate-50"
                  />
                )}
                {field.hint && <span className="text-[11px] text-slate-400">{field.hint}</span>}
              </div>
            ))}
          </div>
        </div>
      ))}

      {canEdit && (
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {isPending ? "Saving & Recalculating..." : "Save Settings"}
          </button>
          {state.error && <span className="text-sm text-red-600">{state.error}</span>}
          {state.success && (
            <span className="text-sm text-green-700">
              Saved. Recalculated {state.recomputedCount ?? 0} products with the new rules.
            </span>
          )}
        </div>
      )}
    </form>
  );
}
