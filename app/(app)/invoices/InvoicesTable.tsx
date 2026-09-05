"use client";

import { DataTable, type ColumnDef } from "../../../components/DataTable";
import { StatusBadge } from "../../../components/StatusBadge";
import { formatDate, formatMoney, formatNumber } from "../../../lib/format";
import type { InvoiceListRow } from "../../../lib/queries/invoices";

export function InvoicesTable({ rows }: { rows: InvoiceListRow[] }) {
  const columns: ColumnDef<InvoiceListRow>[] = [
    { key: "invoiceNumber", header: "Invoice #", render: (r) => <span className="font-medium text-slate-800">{r.invoiceNumber}</span>, sortValue: (r) => r.invoiceNumber },
    { key: "supplier", header: "Supplier", render: (r) => r.supplierName ?? "—", sortValue: (r) => r.supplierName ?? "" },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} label={r.status} /> },
    { key: "lines", header: "Lines", render: (r) => formatNumber(r.lineCount), sortValue: (r) => r.lineCount, align: "right" },
    {
      key: "flagged",
      header: "Flagged",
      render: (r) => (r.flaggedCount > 0 ? <span className="font-semibold text-red-600">{r.flaggedCount}</span> : <span className="text-slate-400">0</span>),
      sortValue: (r) => r.flaggedCount,
      align: "right",
    },
    { key: "total", header: "Total", render: (r) => formatMoney(r.totalAmount), sortValue: (r) => r.totalAmount, align: "right" },
    { key: "invoiceDate", header: "Invoice Date", render: (r) => formatDate(r.invoiceDate), sortValue: (r) => r.invoiceDate ?? "" },
    { key: "uploaded", header: "Uploaded", render: (r) => formatDate(r.createdAt), sortValue: (r) => r.createdAt },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      rowHref={(r) => `/invoices/${r.id}`}
      searchPlaceholder="Search invoice number or supplier..."
      searchFields={(r) => `${r.invoiceNumber} ${r.supplierName ?? ""}`}
      emptyMessage="No invoices uploaded yet."
    />
  );
}
