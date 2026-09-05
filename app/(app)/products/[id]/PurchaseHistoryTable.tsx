"use client";

import { DataTable, type ColumnDef } from "../../../../components/DataTable";
import { formatDate, formatMoney, formatNumber, formatPct } from "../../../../lib/format";

export interface PurchaseHistoryRow {
  id: string;
  date: string;
  invoiceId: string | null;
  supplierName: string | null;
  barcodeRaw: string | null;
  qty: number;
  newCost: string;
  previousCost: string | null;
  priceDiff: string | null;
  priceDiffPct: string | null;
}

/** Chronological purchase history table (spec section 15). */
export function PurchaseHistoryTable({ rows }: { rows: PurchaseHistoryRow[] }) {
  const columns: ColumnDef<PurchaseHistoryRow>[] = [
    { key: "date", header: "Date", render: (r) => formatDate(r.date), sortValue: (r) => r.date },
    { key: "invoice", header: "Invoice ID", render: (r) => r.invoiceId ?? "—" },
    { key: "supplier", header: "Supplier", render: (r) => r.supplierName ?? "Unknown" },
    { key: "barcode", header: "Barcode", render: (r) => r.barcodeRaw ?? "—" },
    { key: "qty", header: "Qty", render: (r) => formatNumber(r.qty), sortValue: (r) => r.qty, align: "right" },
    { key: "newCost", header: "New Cost", render: (r) => formatMoney(r.newCost), sortValue: (r) => Number(r.newCost), align: "right" },
    { key: "prevCost", header: "Previous Cost", render: (r) => formatMoney(r.previousCost), align: "right" },
    {
      key: "diff",
      header: "Price Diff",
      render: (r) => (r.priceDiff == null ? "—" : formatMoney(r.priceDiff)),
      align: "right",
    },
    {
      key: "diffPct",
      header: "Price Diff %",
      render: (r) => (r.priceDiffPct == null ? "—" : formatPct(Number(r.priceDiffPct) * 100)),
      align: "right",
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      emptyMessage="No purchase history recorded for this product yet."
    />
  );
}
