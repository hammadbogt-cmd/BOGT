"use client";

import { DataTable, type ColumnDef } from "../../../../components/DataTable";
import { StatusBadge } from "../../../../components/StatusBadge";
import { formatDateTime, formatMoney, formatNumber, titleCase } from "../../../../lib/format";

export interface StockMovementRow {
  id: string;
  direction: "IN" | "OUT";
  sourceType: string;
  qty: number;
  transactionDate: string;
  invoiceId: string | null;
  shipmentReference: string | null;
  location: { code: string; name: string };
  newCostPrice: string | null;
  remarks: string | null;
  runningTotalBefore: number;
  runningTotalAfter: number;
}

/** Combined Stock_IN / Stock_OUT chronological history with a running balance (spec section 16). */
export function StockMovementTable({ rows }: { rows: StockMovementRow[] }) {
  const columns: ColumnDef<StockMovementRow>[] = [
    { key: "date", header: "Date", render: (r) => formatDateTime(r.transactionDate), sortValue: (r) => r.transactionDate },
    {
      key: "direction",
      header: "Movement",
      render: (r) => <StatusBadge status={r.direction === "IN" ? "PRICE_OK" : "PRICE_INCREASED"} label={r.direction === "IN" ? "Stock In" : "Stock Out"} />,
    },
    { key: "type", header: "Type", render: (r) => titleCase(r.sourceType) },
    { key: "location", header: "Location", render: (r) => r.location.name },
    { key: "qty", header: "Qty", render: (r) => `${r.direction === "IN" ? "+" : "-"}${formatNumber(r.qty)}`, sortValue: (r) => r.qty, align: "right" },
    { key: "runningBefore", header: "Running Total Before", render: (r) => formatNumber(r.runningTotalBefore), align: "right" },
    { key: "runningAfter", header: "Running Total After", render: (r) => formatNumber(r.runningTotalAfter), align: "right" },
    { key: "ref", header: "Invoice / Shipment Ref", render: (r) => r.invoiceId ?? r.shipmentReference ?? "—" },
    { key: "cost", header: "Cost", render: (r) => (r.newCostPrice ? formatMoney(r.newCostPrice) : "—"), align: "right" },
    { key: "remarks", header: "Remarks", render: (r) => r.remarks ?? "—" },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      emptyMessage="No stock movements recorded for this product yet."
    />
  );
}
