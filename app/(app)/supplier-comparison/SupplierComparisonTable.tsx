"use client";

import { DataTable, type ColumnDef } from "../../../components/DataTable";
import { StatusBadge } from "../../../components/StatusBadge";
import { formatMoney, formatNumber, formatPct } from "../../../lib/format";
import type { SupplierComparisonRow } from "../../../lib/queries/supplier-comparison";

export function SupplierComparisonTable({ rows }: { rows: SupplierComparisonRow[] }) {
  const columns: ColumnDef<SupplierComparisonRow>[] = [
    {
      key: "product",
      header: "Product",
      render: (r) => (
        <div className="max-w-xs">
          <div className="truncate font-medium text-slate-800">{r.title}</div>
          <div className="text-xs text-slate-400">
            {r.brand ?? "—"} · {r.primaryBarcode ?? "—"} · {r.offerCount} offer{r.offerCount === 1 ? "" : "s"}
          </div>
        </div>
      ),
      sortValue: (r) => r.title,
    },
    { key: "supplier", header: "Supplier", render: (r) => r.supplierName, sortValue: (r) => r.supplierName },
    { key: "price", header: "Price", render: (r) => formatMoney(r.price), sortValue: (r) => r.price, align: "right" },
    { key: "stock", header: "Supplier Stock", render: (r) => (r.stockQty != null ? formatNumber(r.stockQty) : "—"), align: "right" },
    { key: "moq", header: "MOQ", render: (r) => (r.moq != null ? formatNumber(r.moq) : "—"), align: "right" },
    { key: "lead", header: "Lead Time", render: (r) => (r.leadTimeDays != null ? `${r.leadTimeDays}d` : "—"), align: "right" },
    { key: "profit", header: "Profit/Unit", render: (r) => (r.profit != null ? formatMoney(r.profit) : "—"), align: "right" },
    { key: "roi", header: "ROI", render: (r) => (r.roiPct != null ? formatPct(r.roiPct) : "—"), align: "right" },
    {
      key: "flags",
      header: "Position",
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.isCheapest && <StatusBadge status="BUYBOX_WIN" label="Cheapest" />}
          {r.isRecommended && <StatusBadge status="MATCHED_ALREADY_SELLING" label="Recommended" />}
          {r.isCheapest && !r.isRecommended && <StatusBadge status="SUPPLIER_NOT_FOUND" label="Cheapest ≠ Recommended" />}
          {r.disqualifiedReasons.map((reason) => (
            <StatusBadge key={reason} status="LOSS" label={reason.replace(/_/g, " ")} />
          ))}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => `${r.productId}-${r.supplierId}`}
      rowHref={(r) => `/products/${r.productId}`}
      searchPlaceholder="Search product, brand, barcode, supplier..."
      searchFields={(r) => `${r.title} ${r.brand ?? ""} ${r.primaryBarcode ?? ""} ${r.supplierName}`}
      pageSize={100}
      emptyMessage="No supplier offers match this filter."
    />
  );
}
