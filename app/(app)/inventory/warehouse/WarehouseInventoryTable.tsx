"use client";

import { DataTable, type ColumnDef } from "../../../../components/DataTable";
import { StatusBadge } from "../../../../components/StatusBadge";
import { formatMoney, formatNumber } from "../../../../lib/format";
import type { WarehouseInventoryRow } from "../../../../lib/queries/inventory";

export function WarehouseInventoryTable({ rows }: { rows: WarehouseInventoryRow[] }) {
  const columns: ColumnDef<WarehouseInventoryRow>[] = [
    {
      key: "title",
      header: "Product",
      render: (r) => (
        <div className="max-w-xs">
          <div className="truncate font-medium text-slate-800">{r.title}</div>
          <div className="text-xs text-slate-400">{r.brand ?? "—"}</div>
        </div>
      ),
      sortValue: (r) => r.title,
    },
    { key: "barcode", header: "Barcode", render: (r) => r.primaryBarcode ?? "—" },
    { key: "asin", header: "ASIN", render: (r) => r.asin ?? "—" },
    { key: "rover", header: "Rover Qty", render: (r) => formatNumber(r.roverQty), sortValue: (r) => r.roverQty, align: "right" },
    { key: "office", header: "Office Qty", render: (r) => formatNumber(r.officeQty), sortValue: (r) => r.officeQty, align: "right" },
    { key: "incoming", header: "Incoming PO", render: (r) => formatNumber(r.incomingPoQty), sortValue: (r) => r.incomingPoQty, align: "right" },
    { key: "shelf", header: "Shelf Location", render: (r) => r.shelfLocation ?? "—" },
    { key: "boxes", header: "Boxes", render: (r) => (r.totalBoxes != null ? formatNumber(r.totalBoxes) : "—"), align: "right" },
    { key: "perBox", header: "Units/Box", render: (r) => (r.qtyPerBox != null ? formatNumber(r.qtyPerBox) : "—"), align: "right" },
    { key: "loose", header: "Loose Qty", render: (r) => (r.looseQty != null ? formatNumber(r.looseQty) : "—"), align: "right" },
    { key: "cost", header: "Current Cost", render: (r) => formatMoney(r.currentCost), sortValue: (r) => (r.currentCost ? Number(r.currentCost) : null), align: "right" },
    { key: "value", header: "Inventory Value", render: (r) => formatMoney(r.inventoryValue), sortValue: (r) => (r.inventoryValue ? Number(r.inventoryValue) : null), align: "right" },
    { key: "stock", header: "Stock Status", render: (r) => <StatusBadge status={r.stockStatus} /> },
    { key: "reorder", header: "Reorder Status", render: (r) => <StatusBadge status={r.reorderStatus} /> },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      rowHref={(r) => `/products/${r.id}`}
      searchPlaceholder="Search title, brand, barcode, ASIN, shelf location..."
      searchFields={(r) => `${r.title} ${r.brand ?? ""} ${r.primaryBarcode ?? ""} ${r.asin ?? ""} ${r.shelfLocation ?? ""}`}
    />
  );
}
