"use client";

import { Fragment, useMemo, useState } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { StatusBadge } from "../../../components/StatusBadge";
import { formatMoney, formatNumber, formatPct } from "../../../lib/format";
import { bulkAddToReorderAction, type BulkAddToReorderState } from "../../actions/reorder-actions";
import type { ReorderCenterRow } from "../../../lib/queries/reorder-center";

const initialState: BulkAddToReorderState = {};

function formulaFor(breakdown: unknown, window: 30 | 60): string | null {
  if (!breakdown || typeof breakdown !== "object") return null;
  const key = window === 30 ? "coverage30" : "coverage60";
  const coverage = (breakdown as Record<string, unknown>)[key];
  if (!coverage || typeof coverage !== "object") return null;
  const formula = (coverage as Record<string, unknown>).formula;
  return typeof formula === "string" ? formula : null;
}

export function ReorderCenterTable({ rows }: { rows: ReorderCenterRow[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [state, formAction, isPending] = useActionState(bulkAddToReorderAction, initialState);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((r) =>
      `${r.title} ${r.brand ?? ""} ${r.primaryBarcode ?? ""} ${r.asin ?? ""} ${r.bestSupplierName ?? ""}`.toLowerCase().includes(q)
    );
  }, [rows, query]);

  const selectableIds = filtered.filter((r) => !r.alreadyOnQuickList && r.recommendedQty30 > 0).map((r) => r.productId);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectableIds));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, brand, barcode, ASIN, supplier..."
          className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-1.5 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
        <span className="text-xs text-slate-500">{filtered.length.toLocaleString()} results</span>
        <div className="ml-auto flex items-center gap-3">
          {state.error && <span className="text-xs text-red-600">{state.error}</span>}
          {(state.added ?? 0) > 0 || (state.skipped ?? 0) > 0 ? (
            <span className="text-xs text-green-700">
              Added {state.added ?? 0}
              {state.skipped ? `, skipped ${state.skipped} (no qty recommended)` : ""}
              {state.alreadyOnList ? `, ${state.alreadyOnList} already on the list` : ""}.
            </span>
          ) : null}
          <button
            type="submit"
            disabled={isPending || selected.size === 0}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-40"
          >
            {isPending ? "Adding..." : `Add Selected to Reorder (${selected.size})`}
          </button>
        </div>
      </div>

      {[...selected].map((id) => (
        <input key={id} type="hidden" name="productIds" value={id} />
      ))}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>
              <th className="px-3 py-2">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={selectableIds.length === 0} />
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Product</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">BSR</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">T30 / T60</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Stock Status</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Days Stock</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Net Avail.</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">30-Day Qty</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">60-Day Qty</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Priority</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Reorder Status</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Best Supplier</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Profit/Unit</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">ROI</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Why</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={15} className="px-3 py-8 text-center text-slate-400">
                  Nothing needs reordering right now.
                </td>
              </tr>
            )}
            {filtered.map((r) => {
              const canSelect = !r.alreadyOnQuickList && r.recommendedQty30 > 0;
              const isExpanded = expanded.has(r.productId);
              const formula30 = formulaFor(r.breakdown, 30);
              const formula60 = formulaFor(r.breakdown, 60);
              return (
                <Fragment key={r.productId}>
                  <tr className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(r.productId)}
                        onChange={() => toggleOne(r.productId)}
                        disabled={!canSelect}
                        title={r.alreadyOnQuickList ? "Already on the Quick Reorder List" : !canSelect ? "No quantity recommended" : undefined}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/products/${r.productId}`} className="block max-w-xs">
                        <div className="truncate font-medium text-slate-800">{r.title}</div>
                        <div className="text-xs text-slate-400">
                          {r.brand ?? "—"} · {r.primaryBarcode ?? "—"} · {r.asin ?? "—"}
                        </div>
                      </Link>
                      {r.alreadyOnQuickList && <StatusBadge status="SUPPLIER_AVAILABLE" label="On Quick List" />}
                    </td>
                    <td className="px-3 py-2 text-right">{formatNumber(r.bsr)}</td>
                    <td className="px-3 py-2 text-right">
                      {formatNumber(r.t30Sales)} / {formatNumber(r.t60Sales)}
                      {r.t60IsEstimated && <span className="text-slate-400"> (est.)</span>}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={r.stockStatus} />
                    </td>
                    <td className="px-3 py-2 text-right">{r.daysOfStock != null ? Number(r.daysOfStock).toFixed(1) : "—"}</td>
                    <td className="px-3 py-2 text-right">{formatNumber(r.netAvailable)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatNumber(r.recommendedQty30)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatNumber(r.recommendedQty60)}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={r.priority} />
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={r.reorderStatus} />
                    </td>
                    <td className="px-3 py-2">{r.bestSupplierName ?? <span className="text-slate-400">None available</span>}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(r.expectedProfitPerUnit)}</td>
                    <td className="px-3 py-2 text-right">{r.expectedRoiPct != null ? formatPct(Number(r.expectedRoiPct)) : "—"}</td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => toggleExpand(r.productId)} className="text-xs text-blue-700 underline">
                        {isExpanded ? "Hide" : "Why?"}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-slate-50">
                      <td colSpan={15} className="px-3 py-3 text-xs">
                        <div className="flex flex-col gap-1 font-mono text-slate-600">
                          {formula30 && <div>30-day: {formula30}</div>}
                          {formula60 && <div>60-day: {formula60}</div>}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </form>
  );
}
