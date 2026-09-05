"use client";

import { DataTable, type ColumnDef } from "../../../components/DataTable";
import { StatusBadge } from "../../../components/StatusBadge";
import { formatDateTime, formatMoney, formatNumber, titleCase } from "../../../lib/format";
import type { StockMovementRow } from "../../../lib/queries/stock-movements";

export function StockMovementsTable({ rows }: { rows: StockMovementRow[] }) {
  const columns: ColumnDef<StockMovementRow>[] = [
    { key: "date", header: "Date", render: (r) => formatDateTime(r.date), sortValue: (r) => r.date },
    {
      key: "product",
      header: "Product",
      render: (r) => (
        <div className="max-w-[220px]">
          <div className="truncate font-medium text-slate-800">{r.productTitle}</div>
          <div className="text-xs text-slate-400">{r.productBarcode ?? "—"}</div>
        </div>
      ),
      sortValue: (r) => r.productTitle,
    },
    { key: "location", header: "Location", render: (r) => r.locationName, sortValue: (r) => r.locationName },
    {
      key: "direction",
      header: "Direction",
      render: (r) => <span className={r.direction === "IN" ? "font-semibold text-green-700" : "font-semibold text-red-600"}>{r.direction === "IN" ? "IN" : "OUT"}</span>,
    },
    { key: "source", header: "Source", render: (r) => <StatusBadge status={r.sourceType} label={titleCase(r.sourceType)} /> },
    {
      key: "qty",
      header: "Qty",
      render: (r) => (
        <span className={r.direction === "IN" ? "text-green-700" : "text-red-600"}>
          {r.direction === "IN" ? "+" : "-"}
          {formatNumber(r.qty)}
        </span>
      ),
      sortValue: (r) => r.qty,
      align: "right",
    },
    { key: "cost", header: "Cost", render: (r) => (r.newCostPrice != null ? formatMoney(r.newCostPrice) : "—"), sortValue: (r) => r.newCostPrice ?? 0, align: "right" },
    { key: "supplier", header: "Supplier", render: (r) => r.supplierName ?? "—" },
    { key: "ref", header: "Reference", render: (r) => r.invoiceId ?? r.shipmentReference ?? "—" },
    { key: "remarks", header: "Remarks", render: (r) => r.remarks ?? "—" },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      rowHref={(r) => `/products/${r.productId}`}
      searchPlaceholder="Search product, supplier, reference..."
      searchFields={(r) => `${r.productTitle} ${r.supplierName ?? ""} ${r.invoiceId ?? ""} ${r.shipmentReference ?? ""}`}
      emptyMessage="No stock movements match these filters."
    />
  );
}
