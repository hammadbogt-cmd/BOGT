"use client";

import { DataTable, type ColumnDef } from "../../../components/DataTable";
import { formatDate, formatMoney, formatNumber, formatPct, titleCase } from "../../../lib/format";
import type { PurchaseHistoryRow } from "../../../lib/queries/purchase-history";

export function PurchaseHistoryTable({ rows }: { rows: PurchaseHistoryRow[] }) {
  const columns: ColumnDef<PurchaseHistoryRow>[] = [
    { key: "date", header: "Date", render: (r) => formatDate(r.date), sortValue: (r) => r.date },
    {
      key: "product",
      header: "Product",
      render: (r) => (
        <div className="max-w-[240px]">
          <div className="truncate font-medium text-slate-800">{r.productTitle}</div>
          <div className="text-xs text-slate-400">{r.productBarcode ?? "—"}</div>
        </div>
      ),
      sortValue: (r) => r.productTitle,
    },
    { key: "supplier", header: "Supplier", render: (r) => r.supplierName ?? "—", sortValue: (r) => r.supplierName ?? "" },
    { key: "qty", header: "Qty", render: (r) => formatNumber(r.qty), sortValue: (r) => r.qty, align: "right" },
    { key: "cost", header: "Unit Cost", render: (r) => formatMoney(r.newCost), sortValue: (r) => r.newCost, align: "right" },
    { key: "total", header: "Line Total", render: (r) => formatMoney(r.lineTotal), sortValue: (r) => r.lineTotal, align: "right" },
    {
      key: "diff",
      header: "Price Change",
      render: (r) =>
        r.priceDiff == null ? (
          <span className="text-slate-400">—</span>
        ) : (
          <span className={r.priceDiff > 0 ? "text-red-600" : r.priceDiff < 0 ? "text-green-700" : "text-slate-500"}>
            {r.priceDiff > 0 ? "+" : ""}
            {formatMoney(r.priceDiff)} {r.priceDiffPct != null ? `(${r.priceDiffPct > 0 ? "+" : ""}${formatPct(r.priceDiffPct)})` : ""}
          </span>
        ),
      sortValue: (r) => r.priceDiff ?? 0,
    },
    { key: "invoice", header: "Invoice", render: (r) => r.invoiceId ?? "—" },
    { key: "source", header: "Source", render: (r) => titleCase(r.source) },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      rowHref={(r) => `/products/${r.productId}`}
      searchPlaceholder="Search product, supplier, invoice..."
      searchFields={(r) => `${r.productTitle} ${r.supplierName ?? ""} ${r.invoiceId ?? ""}`}
      emptyMessage="No purchase history matches these filters."
    />
  );
}
