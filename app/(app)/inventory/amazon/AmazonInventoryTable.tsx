"use client";

import { DataTable, type ColumnDef } from "../../../../components/DataTable";
import { StatusBadge } from "../../../../components/StatusBadge";
import { formatMoney, formatNumber } from "../../../../lib/format";
import type { AmazonInventoryRow } from "../../../../lib/queries/inventory";

export function AmazonInventoryTable({ rows }: { rows: AmazonInventoryRow[] }) {
  const columns: ColumnDef<AmazonInventoryRow>[] = [
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
    { key: "asin", header: "ASIN", render: (r) => r.asin ?? "—" },
    { key: "sku", header: "SKU", render: (r) => r.amazonSku ?? "—" },
    { key: "bsr", header: "BSR", render: (r) => formatNumber(r.bsr), sortValue: (r) => r.bsr, align: "right" },
    { key: "t30", header: "T30 Sales", render: (r) => formatNumber(r.unitsShippedT30), sortValue: (r) => r.unitsShippedT30, align: "right" },
    { key: "available", header: "Available", render: (r) => formatNumber(r.amazonAvailableQty), sortValue: (r) => r.amazonAvailableQty, align: "right" },
    { key: "reserved", header: "Reserved", render: (r) => formatNumber(r.amazonReservedQty), sortValue: (r) => r.amazonReservedQty, align: "right" },
    { key: "inbound", header: "Inbound", render: (r) => formatNumber(r.amazonInboundQty), sortValue: (r) => r.amazonInboundQty, align: "right" },
    { key: "unfulfillable", header: "Unfulfillable", render: (r) => formatNumber(r.amazonUnfulfillableQty), sortValue: (r) => r.amazonUnfulfillableQty, align: "right" },
    { key: "buybox", header: "Buy Box", render: (r) => formatMoney(r.buyBoxPrice), sortValue: (r) => (r.buyBoxPrice ? Number(r.buyBoxPrice) : null), align: "right" },
    { key: "ourprice", header: "Our Price", render: (r) => formatMoney(r.ourPrice), sortValue: (r) => (r.ourPrice ? Number(r.ourPrice) : null), align: "right" },
    { key: "listing", header: "Listing", render: (r) => <StatusBadge status={r.listingStatus} /> },
    { key: "stock", header: "Stock Status", render: (r) => <StatusBadge status={r.stockStatus} /> },
    { key: "profit", header: "Profit", render: (r) => <StatusBadge status={r.profitStatus} /> },
    { key: "value", header: "Inventory Value", render: (r) => formatMoney(r.inventoryValue), sortValue: (r) => (r.inventoryValue ? Number(r.inventoryValue) : null), align: "right" },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      rowHref={(r) => `/products/${r.id}`}
      searchPlaceholder="Search title, brand, ASIN, SKU..."
      searchFields={(r) => `${r.title} ${r.brand ?? ""} ${r.asin ?? ""} ${r.amazonSku ?? ""}`}
    />
  );
}
