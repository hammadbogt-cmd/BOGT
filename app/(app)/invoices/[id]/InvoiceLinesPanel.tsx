"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DataTable, type ColumnDef } from "../../../../components/DataTable";
import { StatusBadge } from "../../../../components/StatusBadge";
import { formatMoney, formatNumber, formatPct } from "../../../../lib/format";
import { setInvoiceStatusAction, type InvoiceStatusState } from "../../../actions/invoice-actions";
import type { InvoiceDetail, InvoiceLineRow } from "../../../../lib/queries/invoices";

const initial: InvoiceStatusState = {};

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  REVIEWED: ["APPROVED", "REJECTED"],
  APPROVED: ["RECEIVED", "REJECTED"],
  MATCHING: ["APPROVED", "REJECTED"],
  UPLOADED: ["APPROVED", "REJECTED"],
};

export function InvoiceLinesPanel({ invoice, canManage }: { invoice: InvoiceDetail; canManage: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [state, formAction, isPending] = useActionState(setInvoiceStatusAction, initial);

  useEffect(() => {
    if (state.success) startTransition(() => router.refresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  const nextStatuses = ALLOWED_TRANSITIONS[invoice.status] ?? [];

  const columns: ColumnDef<InvoiceLineRow>[] = [
    {
      key: "product",
      header: "Product",
      render: (r) =>
        r.productId ? (
          <Link href={`/products/${r.productId}`} className="block max-w-[220px]">
            <div className="truncate font-medium text-slate-800">{r.productTitle}</div>
            <div className="text-xs text-slate-400">{r.barcodeRaw ?? "—"}</div>
          </Link>
        ) : (
          <div className="max-w-[220px]">
            <div className="truncate font-medium text-slate-500">{r.titleRaw ?? "Unmatched"}</div>
            <div className="text-xs text-slate-400">{r.barcodeRaw ?? "—"}</div>
          </div>
        ),
      sortValue: (r) => r.productTitle ?? r.titleRaw ?? "",
    },
    { key: "qty", header: "Qty", render: (r) => formatNumber(r.invoiceQty), sortValue: (r) => r.invoiceQty, align: "right" },
    { key: "price", header: "Invoice Price", render: (r) => formatMoney(r.invoicePrice), sortValue: (r) => r.invoicePrice, align: "right" },
    {
      key: "ref",
      header: "Reference Price",
      render: (r) => (
        <div className="text-right">
          <div>{r.referencePrice != null ? formatMoney(r.referencePrice) : "—"}</div>
          <div className="text-[11px] text-slate-400">{r.referenceSource}</div>
        </div>
      ),
      sortValue: (r) => r.referencePrice ?? 0,
      align: "right",
    },
    {
      key: "diff",
      header: "Diff",
      render: (r) =>
        r.priceDiff == null ? (
          <span className="text-slate-400">—</span>
        ) : (
          <span className={r.priceDiff > 0 ? "text-red-600" : r.priceDiff < 0 ? "text-green-700" : "text-slate-500"}>
            {r.priceDiff > 0 ? "+" : ""}
            {formatMoney(r.priceDiff)} {r.priceDiffPct != null ? `(${r.priceDiffPct > 0 ? "+" : ""}${formatPct(r.priceDiffPct * 100)})` : ""}
          </span>
        ),
      sortValue: (r) => r.priceDiff ?? 0,
    },
    {
      key: "betterSupplier",
      header: "Best Current Supplier",
      render: (r) => (r.bestCurrentSupplierPrice != null ? formatMoney(r.bestCurrentSupplierPrice) : "—"),
      sortValue: (r) => r.bestCurrentSupplierPrice ?? 0,
      align: "right",
    },
    { key: "profit", header: "Profit/Unit", render: (r) => (r.profit != null ? formatMoney(r.profit) : "—"), sortValue: (r) => r.profit ?? 0, align: "right" },
    { key: "roi", header: "ROI", render: (r) => (r.roiPct != null ? formatPct(r.roiPct) : "—"), sortValue: (r) => r.roiPct ?? 0, align: "right" },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} label={r.status} /> },
  ];

  return (
    <div className="flex flex-col gap-4">
      {canManage && nextStatuses.length > 0 && (
        <form action={formAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="invoiceId" value={invoice.id} />
          {nextStatuses.map((s) => (
            <button
              key={s}
              type="submit"
              name="status"
              value={s}
              disabled={isPending}
              className={`rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 ${
                s === "REJECTED"
                  ? "border border-red-300 text-red-700 hover:bg-red-50"
                  : "bg-slate-900 text-white hover:bg-slate-800"
              }`}
            >
              {isPending ? "Saving..." : `Mark ${s}`}
            </button>
          ))}
          {state.error && <span className="text-sm text-red-600">{state.error}</span>}
        </form>
      )}

      <DataTable
        columns={columns}
        rows={invoice.lines}
        rowKey={(r) => r.id}
        searchPlaceholder="Search product..."
        searchFields={(r) => `${r.productTitle ?? ""} ${r.titleRaw ?? ""} ${r.barcodeRaw ?? ""}`}
        emptyMessage="This invoice has no lines."
      />
    </div>
  );
}
