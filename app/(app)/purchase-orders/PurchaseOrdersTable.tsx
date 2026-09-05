"use client";

import { DataTable, type ColumnDef } from "../../../components/DataTable";
import { StatusBadge } from "../../../components/StatusBadge";
import { formatDate, formatMoney, formatNumber } from "../../../lib/format";
import type { PurchaseOrderListRow } from "../../../lib/queries/purchase-orders";

export function PurchaseOrdersTable({ rows }: { rows: PurchaseOrderListRow[] }) {
  const columns: ColumnDef<PurchaseOrderListRow>[] = [
    { key: "poNumber", header: "PO Number", render: (r) => <span className="font-medium text-slate-800">{r.poNumber}</span>, sortValue: (r) => r.poNumber },
    { key: "supplier", header: "Supplier", render: (r) => r.supplierName, sortValue: (r) => r.supplierName },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} label={r.status} /> },
    { key: "items", header: "Items", render: (r) => formatNumber(r.itemCount), sortValue: (r) => r.itemCount, align: "right" },
    {
      key: "received",
      header: "Received",
      render: (r) => `${formatNumber(r.totalReceivedQty)} / ${formatNumber(r.totalOrderedQty)}`,
      sortValue: (r) => r.totalReceivedQty,
      align: "right",
    },
    { key: "total", header: "Expected Total", render: (r) => formatMoney(r.totalExpected), sortValue: (r) => r.totalExpected, align: "right" },
    { key: "orderDate", header: "Order Date", render: (r) => formatDate(r.orderDate), sortValue: (r) => r.orderDate },
    { key: "expected", header: "Expected Delivery", render: (r) => formatDate(r.expectedDelivery), sortValue: (r) => r.expectedDelivery ?? "" },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      rowHref={(r) => `/purchase-orders/${r.id}`}
      searchPlaceholder="Search PO number or supplier..."
      searchFields={(r) => `${r.poNumber} ${r.supplierName}`}
      emptyMessage="No purchase orders yet — convert items from a Purchase Plan to create one."
    />
  );
}
