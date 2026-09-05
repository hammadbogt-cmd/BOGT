"use client";

import { DataTable, type ColumnDef } from "../../../../components/DataTable";
import { StatusBadge } from "../../../../components/StatusBadge";
import { formatDate, formatMoney, formatNumber } from "../../../../lib/format";
import type { SupplierDetail } from "../../../../lib/queries/suppliers";

type Row = SupplierDetail["products"][number];

export function SupplierProductsTable({ rows }: { rows: Row[] }) {
  const columns: ColumnDef<Row>[] = [
    {
      key: "title",
      header: "Product",
      render: (r) => (
        <div className="max-w-xs">
          <div className="truncate font-medium text-slate-800">{r.title}</div>
          <div className="text-xs text-slate-400">
            {r.brand ?? "—"} · {r.primaryBarcode ?? "—"}
          </div>
        </div>
      ),
      sortValue: (r) => r.title,
    },
    { key: "price", header: "Price", render: (r) => formatMoney(r.price), sortValue: (r) => Number(r.price), align: "right" },
    { key: "stock", header: "Supplier Stock", render: (r) => (r.stockQty != null ? formatNumber(r.stockQty) : "—"), align: "right" },
    { key: "moq", header: "MOQ", render: (r) => (r.moq != null ? formatNumber(r.moq) : "—"), align: "right" },
    { key: "lead", header: "Lead Time", render: (r) => (r.leadTimeDays != null ? `${r.leadTimeDays}d` : "—"), align: "right" },
    { key: "updated", header: "Last Updated", render: (r) => formatDate(r.lastUpdated) },
    { key: "preferred", header: "Preferred", render: (r) => (r.isPreferred ? <StatusBadge status="MATCHED_ALREADY_SELLING" label="Preferred" /> : "—") },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.productId}
      rowHref={(r) => `/products/${r.productId}`}
      searchPlaceholder="Search product, brand, barcode..."
      searchFields={(r) => `${r.title} ${r.brand ?? ""} ${r.primaryBarcode ?? ""}`}
      emptyMessage="This supplier has no active product offers yet."
    />
  );
}
