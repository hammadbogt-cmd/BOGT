"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StatusBadge } from "../../../../components/StatusBadge";
import { formatMoney, formatNumber, formatPct } from "../../../../lib/format";
import {
  updatePlanItemAction,
  setPlanItemStatusAction,
  convertToPurchaseOrderAction,
  type ConvertToPoState,
} from "../../../actions/purchase-plan-actions";
import type { PurchasePlanItemRow } from "../../../../lib/queries/purchase-plans";

const NOT_CONVERTIBLE = new Set(["ORDERED", "PARTIALLY_ORDERED", "AWAITING_INVOICE", "INVOICED", "RECEIVED", "CANCELLED"]);
const convertInitial: ConvertToPoState = {};

export function PlanItemsTable({ items, canApprove, canConvert }: { items: PurchasePlanItemRow[]; canApprove: boolean; canConvert: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowMessage, setRowMessage] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, { qty: string; supplierId: string; notes: string }>>({});
  const [isPending, startTransition] = useTransition();
  const [convertState, convertAction, convertPending] = useActionState(convertToPurchaseOrderAction, convertInitial);

  // A successful convert changes each converted item's status and can drop
  // it out of the "convertible" set — drop any per-row draft/selection for
  // items whose form fields the Next.js action refresh doesn't re-sync on
  // its own frame, so the row falls back to the fresh server-provided
  // values instead of a stale supplier/qty draft.
  useEffect(() => {
    if (convertState.success) {
      setSelected(new Set());
      setDrafts({});
      startTransition(() => router.refresh());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convertState.success, convertState.createdPoNumbers?.join(",")]);

  function defaultDraft(item: PurchasePlanItemRow) {
    return { qty: String(item.userFinalQty ?? item.systemRecommendedQty), supplierId: item.supplierId ?? "", notes: item.notes ?? "" };
  }

  function draftFor(item: PurchasePlanItemRow) {
    return drafts[item.id] ?? defaultDraft(item);
  }

  function setDraft(item: PurchasePlanItemRow, patch: Partial<{ qty: string; supplierId: string; notes: string }>) {
    setDrafts((prev) => ({ ...prev, [item.id]: { ...(prev[item.id] ?? defaultDraft(item)), ...patch } }));
  }

  async function handleSave(item: PurchasePlanItemRow) {
    const draft = draftFor(item);
    setSavingId(item.id);
    const fd = new FormData();
    fd.set("itemId", item.id);
    fd.set("userFinalQty", draft.qty);
    fd.set("supplierId", draft.supplierId);
    fd.set("notes", draft.notes);
    const result = await updatePlanItemAction({}, fd);
    setSavingId(null);
    setRowMessage((prev) => ({ ...prev, [item.id]: result.error ?? "Saved." }));
    if (result.success) startTransition(() => router.refresh());
  }

  async function handleStatus(item: PurchasePlanItemRow, status: string) {
    setSavingId(item.id);
    const fd = new FormData();
    fd.set("itemId", item.id);
    fd.set("status", status);
    const result = await setPlanItemStatusAction({}, fd);
    setSavingId(null);
    setRowMessage((prev) => ({ ...prev, [item.id]: result.error ?? `Marked ${status}.` }));
    if (result.success) startTransition(() => router.refresh());
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const convertibleIds = items.filter((i) => i.supplierId && i.supplierPrice != null && !NOT_CONVERTIBLE.has(i.status)).map((i) => i.id);
  const allSelected = convertibleIds.length > 0 && convertibleIds.every((id) => selected.has(id));

  return (
    <form action={convertAction} className="flex flex-col gap-3">
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="itemIds" value={id} />
      ))}

      {canConvert && (
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={convertPending || selected.size === 0}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-40"
          >
            {convertPending ? "Converting..." : `Convert Selected to Purchase Order (${selected.size})`}
          </button>
          {convertState.error && <span className="text-sm text-red-600">{convertState.error}</span>}
          {convertState.success && (
            <span className="text-sm text-green-700">
              Created {convertState.createdPoNumbers?.length ?? 0} PO(s):{" "}
              {convertState.createdPoNumbers?.map((po, i) => (
                <span key={po}>
                  {i > 0 && ", "}
                  <Link href="/purchase-orders" className="underline">
                    {po}
                  </Link>
                </span>
              ))}
              {convertState.skipped ? ` (${convertState.skipped} skipped — no supplier/price or already ordered)` : ""}
            </span>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {canConvert && (
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    disabled={convertibleIds.length === 0}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(convertibleIds))}
                  />
                </th>
              )}
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Product</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">System Rec. Qty</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">User Final Qty</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Supplier</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Price</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Expected Cost</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Expected Profit</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">ROI</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {items.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-slate-400">
                  This plan has no items.
                </td>
              </tr>
            )}
            {items.map((item) => {
              const draft = draftFor(item);
              const isSaving = savingId === item.id;
              const isConvertible = item.supplierId && item.supplierPrice != null && !NOT_CONVERTIBLE.has(item.status);
              return (
                <tr key={item.id} className="align-top hover:bg-slate-50">
                  {canConvert && (
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={selected.has(item.id)} disabled={!isConvertible} onChange={() => toggleOne(item.id)} />
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <Link href={`/products/${item.productId}`} className="block max-w-[220px]">
                      <div className="truncate font-medium text-slate-800">{item.productTitle}</div>
                      <div className="text-xs text-slate-400">{item.productBarcode ?? "—"}</div>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">{formatNumber(item.systemRecommendedQty)}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min={0}
                      value={draft.qty}
                      onChange={(e) => setDraft(item, { qty: e.target.value })}
                      className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={draft.supplierId}
                      onChange={(e) => setDraft(item, { supplierId: e.target.value })}
                      className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                    >
                      <option value="">No supplier</option>
                      {item.availableSuppliers.map((s) => (
                        <option key={s.supplierId} value={s.supplierId}>
                          {s.supplierName} ({formatMoney(s.price)})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right">{formatMoney(item.supplierPrice)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(item.expectedTotalCost)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(item.expectedProfit)}</td>
                  <td className="px-3 py-2 text-right">{item.roiPct != null ? formatPct(item.roiPct) : "—"}</td>
                  <td className="px-3 py-2">
                    <input
                      value={draft.notes}
                      onChange={(e) => setDraft(item, { notes: e.target.value })}
                      placeholder="Notes"
                      className="w-32 rounded-md border border-slate-300 px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={item.status} label={item.status} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => handleSave(item)}
                        className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                      >
                        {isSaving ? "..." : "Save"}
                      </button>
                      {canApprove && item.status !== "APPROVED" && item.status !== "CANCELLED" && !NOT_CONVERTIBLE.has(item.status) && (
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => handleStatus(item, "APPROVED")}
                          className="rounded-md bg-green-700 px-2 py-1 text-xs font-medium text-white hover:bg-green-800 disabled:opacity-50"
                        >
                          Approve
                        </button>
                      )}
                      {item.status !== "CANCELLED" && !NOT_CONVERTIBLE.has(item.status) && (
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => handleStatus(item, "CANCELLED")}
                          className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      )}
                      {rowMessage[item.id] && <span className="text-[11px] text-slate-500">{rowMessage[item.id]}</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {isPending && <span className="text-xs text-slate-400">Refreshing…</span>}
    </form>
  );
}
