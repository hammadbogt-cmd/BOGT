"use client";

import { useActionState } from "react";
import { StatusBadge } from "../../../components/StatusBadge";
import { formatMoney } from "../../../lib/format";
import { uploadSupplierPriceListAction, type UploadPriceListState } from "../../actions/supplier-price-list-actions";

const initialState: UploadPriceListState = {};

export function UploadPriceListForm({ suppliers }: { suppliers: { id: string; name: string }[] }) {
  const [state, formAction, isPending] = useActionState(uploadSupplierPriceListAction, initialState);

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Upload a Price List</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Supplier
            <select name="supplierId" required className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
              <option value="">Choose a supplier...</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            File (CSV or XLSX)
            <input name="file" type="file" accept=".csv,.xlsx,.xls" required className="text-sm" />
          </label>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {isPending ? "Importing..." : "Upload & Match"}
          </button>
        </div>
        <p className="text-xs text-slate-400">
          Rows are matched by barcode, then ASIN, then SKU — never by title alone. Unmatched rows go to Matching Review instead
          of being merged on a guess.
        </p>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      </form>

      {state.result && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Import Result</h2>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Rows Read" value={state.result.rowsRead} />
            <Stat label="Created" value={state.result.created} tone="green" />
            <Stat label="Updated" value={state.result.updated} tone="blue" />
            <Stat label="Unchanged" value={state.result.unchanged} />
            <Stat label="Unmatched" value={state.result.unmatched} tone="orange" />
            <Stat label="Errors" value={state.result.errors} tone="red" />
          </div>

          {state.result.mappingIssue && (
            <div className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-800 ring-1 ring-inset ring-red-200">
              SOURCE MAPPING ISSUE — missing required column(s): {state.result.mappingIssue.missingRequired.join(", ")}
            </div>
          )}

          {state.result.rows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Row</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Product</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Barcode / ASIN / SKU</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Price</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Previous</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {state.result.rows.slice(0, 200).map((r) => (
                    <tr key={r.rowNumber}>
                      <td className="px-3 py-2 text-slate-400">{r.rowNumber}</td>
                      <td className="px-3 py-2">
                        <StatusBadge
                          status={
                            r.status === "CREATED" || r.status === "UPDATED"
                              ? "PRICE_OK"
                              : r.status === "UNMATCHED"
                              ? "BARCODE_NOT_MATCHED"
                              : r.status === "ERROR"
                              ? "LARGE_PRICE_INCREASE"
                              : "NONE"
                          }
                          label={r.status}
                        />
                      </td>
                      <td className="px-3 py-2 max-w-xs truncate">{r.productTitle ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{[r.barcode, r.asin, r.sku].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="px-3 py-2 text-right">{r.price != null ? formatMoney(r.price) : "—"}</td>
                      <td className="px-3 py-2 text-right">{r.previousPrice != null ? formatMoney(r.previousPrice) : "—"}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{r.error ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {state.result.rows.length > 200 && (
                <p className="px-3 py-2 text-xs text-slate-400">Showing first 200 of {state.result.rows.length} rows.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "green" | "blue" | "orange" | "red" }) {
  const toneClass =
    tone === "green"
      ? "text-green-700"
      : tone === "blue"
      ? "text-blue-700"
      : tone === "orange"
      ? "text-orange-700"
      : tone === "red"
      ? "text-red-700"
      : "text-slate-800";
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wide text-slate-400">{label}</span>
      <span className={`text-lg font-semibold ${toneClass}`}>{value}</span>
    </div>
  );
}
