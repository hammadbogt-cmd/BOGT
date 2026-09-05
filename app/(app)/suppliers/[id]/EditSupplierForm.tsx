"use client";

import { useActionState } from "react";
import { updateSupplierAction, type SupplierFormState } from "../../../actions/supplier-actions";
import type { SupplierDetail } from "../../../../lib/queries/suppliers";

const initialState: SupplierFormState = {};

export function EditSupplierForm({ supplier, canEdit }: { supplier: SupplierDetail; canEdit: boolean }) {
  const [state, formAction, isPending] = useActionState(updateSupplierAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={supplier.id} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Contact Name
          <input name="contactName" defaultValue={supplier.contactName ?? ""} disabled={!canEdit} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Contact Email
          <input name="contactEmail" type="email" defaultValue={supplier.contactEmail ?? ""} disabled={!canEdit} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Contact Phone
          <input name="contactPhone" defaultValue={supplier.contactPhone ?? ""} disabled={!canEdit} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Lead Time (days)
          <input name="leadTimeDays" type="number" defaultValue={supplier.leadTimeDays ?? ""} disabled={!canEdit} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          MOQ
          <input name="moq" type="number" defaultValue={supplier.moq ?? ""} disabled={!canEdit} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Case Pack
          <input name="casePack" type="number" defaultValue={supplier.casePack ?? ""} disabled={!canEdit} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Priority Weight
          <input name="priority" type="number" defaultValue={supplier.priority} disabled={!canEdit} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Currency
          <input name="currency" defaultValue={supplier.currency} disabled={!canEdit} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50" />
        </label>
        <label className="mt-5 inline-flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="isActive" defaultChecked={supplier.isActive} disabled={!canEdit} className="h-4 w-4" />
          Active
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Notes
        <textarea name="notes" defaultValue={supplier.notes ?? ""} disabled={!canEdit} rows={2} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50" />
      </label>
      {canEdit && (
        <div className="flex items-center gap-3">
          <button type="submit" disabled={isPending} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
            {isPending ? "Saving..." : "Save Changes"}
          </button>
          {state.error && <span className="text-sm text-red-600">{state.error}</span>}
          {state.success && <span className="text-sm text-green-700">Saved.</span>}
        </div>
      )}
    </form>
  );
}
