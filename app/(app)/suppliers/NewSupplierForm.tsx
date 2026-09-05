"use client";

import { useActionState, useEffect, useState } from "react";
import { createSupplierAction, type SupplierFormState } from "../../actions/supplier-actions";

const initialState: SupplierFormState = {};

export function NewSupplierForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(createSupplierAction, initialState);

  useEffect(() => {
    if (state.success) setOpen(false);
  }, [state.success]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        + New Supplier
      </button>
    );
  }

  return (
    <form
      action={async (fd) => {
        await formAction(fd);
      }}
      className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h2 className="text-sm font-semibold text-slate-700">New Supplier</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <input name="name" placeholder="Supplier name *" required className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        <input name="contactName" placeholder="Contact name" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        <input name="contactEmail" placeholder="Contact email" type="email" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        <input name="contactPhone" placeholder="Contact phone" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        <input name="leadTimeDays" placeholder="Lead time (days)" type="number" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        <input name="moq" placeholder="MOQ" type="number" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        <input name="casePack" placeholder="Case pack" type="number" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        <input name="priority" placeholder="Priority weight (default 100)" type="number" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        <input name="currency" placeholder="Currency (default AED)" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
      </div>
      <textarea name="notes" placeholder="Notes" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" rows={2} />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={isPending} className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
          {isPending ? "Saving..." : "Save Supplier"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-500 hover:underline">
          Cancel
        </button>
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state.success && <span className="text-sm text-green-700">Supplier created.</span>}
      </div>
    </form>
  );
}
