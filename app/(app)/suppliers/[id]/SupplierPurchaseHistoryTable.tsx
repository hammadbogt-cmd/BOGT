"use client";

import { DataTable, type ColumnDef } from "../../../../components/DataTable";
import { formatDate, formatMoney, formatNumber } from "../../../../lib/format";
import type { SupplierDetail } from "../../../../lib/queries/suppliers";

type Row = SupplierDetail["purchaseHistory"][number];

export function SupplierPurchaseHistoryTable({ rows }: { rows: Row[] }) {
  const columns: ColumnDef<Row>[] = [
    { key: "date", header: "Date", render: (r) => formatDate(r.date), sortValue: (r) => r.date },
    { key: "invoice", header: "Invoice ID", render: (r) => r.invoiceId ?? "—" },
    { key: "product", header: "Product", render: (r) => <span className="max-w-xs truncate">{r.productTitle}</span> },
    { key: "qty", header: "Qty", render: (r) => formatNumber(r.qty), sortValue: (r) => r.qty, align: "right" },
    { key: "cost", header: "Cost", render: (r) => formatMoney(r.newCost), sortValue: (r) => Number(r.newCost), align: "right" },
    { key: "total", header: "Line Total", render: (r) => formatMoney(Number(r.newCost) * r.qty), align: "right" },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      emptyMessage="No purchase history recorded from this supplier yet."
    />
  );
}
