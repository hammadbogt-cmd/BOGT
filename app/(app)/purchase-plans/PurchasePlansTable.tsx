"use client";

import { DataTable, type ColumnDef } from "../../../components/DataTable";
import { StatusBadge } from "../../../components/StatusBadge";
import { formatDateTime, formatMoney, formatNumber } from "../../../lib/format";
import type { PurchasePlanListRow } from "../../../lib/queries/purchase-plans";

export function PurchasePlansTable({ rows }: { rows: PurchasePlanListRow[] }) {
  const columns: ColumnDef<PurchasePlanListRow>[] = [
    { key: "name", header: "Plan", render: (r) => <span className="font-medium text-slate-800">{r.name}</span>, sortValue: (r) => r.name },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} label={r.status} /> },
    { key: "items", header: "Items", render: (r) => formatNumber(r.itemCount), sortValue: (r) => r.itemCount, align: "right" },
    { key: "cost", header: "Expected Cost", render: (r) => formatMoney(r.totalExpectedCost), sortValue: (r) => r.totalExpectedCost, align: "right" },
    { key: "by", header: "Created By", render: (r) => r.createdByName ?? "—" },
    { key: "updated", header: "Last Updated", render: (r) => formatDateTime(r.updatedAt), sortValue: (r) => r.updatedAt },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      rowHref={(r) => `/purchase-plans/${r.id}`}
      searchPlaceholder="Search plan name..."
      searchFields={(r) => r.name}
      emptyMessage="No purchase plans yet — add products to the Quick Reorder List from the Reorder Center or a Product page."
    />
  );
}
