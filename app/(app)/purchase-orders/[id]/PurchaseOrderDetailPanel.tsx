"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatMoney, formatNumber } from "../../../../lib/format";
import {
  markOrderedAction,
  cancelPurchaseOrderAction,
  receiveItemsAction,
  type PoActionState,
  type ReceiveItemsState,
} from "../../../actions/purchase-order-actions";
import type { PurchaseOrderDetail } from "../../../../lib/queries/purchase-orders";

const poInitial: PoActionState = {};
const receiveInitial: ReceiveItemsState = {};

export function PurchaseOrderDetailPanel({
  po,
  canManage,
  canReceive,
}: {
  po: PurchaseOrderDetail;
  canManage: boolean;
  canReceive: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [markState, markAction, markPending] = useActionState(markOrderedAction, poInitial);
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelPurchaseOrderAction, poInitial);
  const [receiveState, receiveAction, receivePending] = useActionState(receiveItemsAction, receiveInitial);
  const [receiveQtys, setReceiveQtys] = useState<Record<string, string>>({});

  useEffect(() => {
    if (markState.success || cancelState.success || receiveState.success) {
      setReceiveQtys({});
      startTransition(() => router.refresh());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markState.success, cancelState.success, receiveState.success]);

  const anyReceived = po.items.some((i) => i.receivedQty > 0);
  const canCancel = canManage && po.status !== "RECEIVED" && po.status !== "CANCELLED" && !anyReceived;
  const canShowReceiveForm = canReceive && (po.status === "ORDERED" || po.status === "PARTIALLY_RECEIVED");
  const totalExpected = po.items.reduce((sum, i) => sum + i.expectedTotal, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {canManage && po.status === "DRAFT" && (
          <form action={markAction}>
            <input type="hidden" name="poId" value={po.id} />
            <button
              type="submit"
              disabled={markPending}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {markPending ? "Marking..." : "Mark as Ordered"}
            </button>
          </form>
        )}
        {canCancel && (
          <form action={cancelAction}>
            <input type="hidden" name="poId" value={po.id} />
            <button
              type="submit"
              disabled={cancelPending}
              className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {cancelPending ? "Cancelling..." : "Cancel PO"}
            </button>
          </form>
        )}
        {markState.error && <span className="text-sm text-red-600">{markState.error}</span>}
        {cancelState.error && <span className="text-sm text-red-600">{cancelState.error}</span>}
      </div>

      <form action={receiveAction} className="flex flex-col gap-3">
        <input type="hidden" name="poId" value={po.id} />
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Product</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Qty Ordered</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Unit Cost</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Expected Total</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Received So Far</th>
                {canShowReceiveForm && (
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Receive Now</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {po.items.map((item) => {
                const remaining = item.qtyOrdered - item.receivedQty;
                return (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <Link href={`/products/${item.productId}`} className="block max-w-[240px]">
                        <div className="truncate font-medium text-slate-800">{item.productTitle}</div>
                        <div className="text-xs text-slate-400">{item.productBarcode ?? "—"}</div>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right">{formatNumber(item.qtyOrdered)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(item.unitCost)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(item.expectedTotal)}</td>
                    <td className="px-3 py-2 text-right">
                      {formatNumber(item.receivedQty)}
                      {remaining === 0 ? <span className="ml-1 text-xs text-green-700">(complete)</span> : null}
                    </td>
                    {canShowReceiveForm && (
                      <td className="px-3 py-2 text-right">
                        {remaining > 0 ? (
                          <input
                            type="number"
                            min={0}
                            max={remaining}
                            placeholder={`up to ${remaining}`}
                            value={receiveQtys[item.id] ?? ""}
                            onChange={(e) => setReceiveQtys((prev) => ({ ...prev, [item.id]: e.target.value }))}
                            name={`receiveQty_${item.id}`}
                            className="w-24 rounded-md border border-slate-300 px-2 py-1 text-right text-sm"
                          />
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              <tr className="bg-slate-50 font-medium">
                <td className="px-3 py-2" colSpan={3}>
                  Total
                </td>
                <td className="px-3 py-2 text-right">{formatMoney(totalExpected)}</td>
                <td className="px-3 py-2" colSpan={canShowReceiveForm ? 2 : 1} />
              </tr>
            </tbody>
          </table>
        </div>

        {canShowReceiveForm && (
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={receivePending}
              className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
            >
              {receivePending ? "Recording..." : "Record Receipt"}
            </button>
            {receiveState.error && <span className="text-sm text-red-600">{receiveState.error}</span>}
            {receiveState.success && <span className="text-sm text-green-700">Receipt recorded — stock and profitability updated.</span>}
          </div>
        )}
      </form>
    </div>
  );
}
