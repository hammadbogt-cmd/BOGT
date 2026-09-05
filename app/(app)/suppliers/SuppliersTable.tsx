"use client";

import { DataTable, type ColumnDef } from "../../../components/DataTable";
import { StatusBadge } from "../../../components/StatusBadge";
import { formatMoney, formatNumber } from "../../../lib/format";
import type { SupplierListRow } from "../../../lib/queries/suppliers";

export function SuppliersTable({ rows }: { rows: SupplierListRow[] }) {
  const columns: ColumnDef<SupplierListRow>[] = [
    {
      key: "name",
      header: "Supplier",
      render: (r) => (
        <div>
          <div className="font-medium text-slate-800">{r.name}</div>
          <div className="text-xs text-slate-400">{r.contactName ?? "No contact set"}</div>
        </div>
      ),
      sortValue: (r) => r.name,
    },
    { key: "email", header: "Email", render: (r) => r.contactEmail ?? "—" },
    { key: "phone", header: "Phone", render: (r) => r.contactPhone ?? "—" },
    { key: "leadTime", header: "Lead Time (days)", render: (r) => (r.leadTimeDays != null ? formatNumber(r.leadTimeDays) : "—"), sortValue: (r) => r.leadTimeDays, align: "right" },
    { key: "priority", header: "Priority Weight", render: (r) => formatNumber(r.priority), sortValue: (r) => r.priority, align: "right" },
    { key: "products", header: "Products Supplied", render: (r) => formatNumber(r.productCount), sortValue: (r) => r.productCount, align: "right" },
    { key: "purchases", header: "# Purchases", render: (r) => formatNumber(r.purchaseCount), sortValue: (r) => r.purchaseCount, align: "right" },
    { key: "spend", header: "Total Spend", render: (r) => formatMoney(r.totalSpend), sortValue: (r) => r.totalSpend, align: "right" },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.isActive ? "HEALTHY" : "NONE"} label={r.isActive ? "Active" : "Inactive"} /> },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      rowHref={(r) => `/suppliers/${r.id}`}
      searchPlaceholder="Search supplier, contact, email..."
      searchFields={(r) => `${r.name} ${r.contactName ?? ""} ${r.contactEmail ?? ""}`}
    />
  );
}
