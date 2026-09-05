"use client";

import { DataTable, type ColumnDef } from "../../../components/DataTable";
import { StatusBadge } from "../../../components/StatusBadge";
import { formatMoney, formatNumber } from "../../../lib/format";

interface Row {
  id: string;
  title: string;
  brand: string | null;
  primaryBarcode: string | null;
  asin: string | null;
  amazonSku: string | null;
  oaSku: string | null;
  catalogSource: string;
  bsr: number | null;
  unitsShippedT30: number | null;
  amazonAvailableQty: number;
  roverQty: number;
  officeQty: number;
  currentCost: string | null;
  ourPrice: string | null;
  profitStatus: string;
  reorderStatus: string;
  listingStatus: string;
  inventoryValue: string | null;
  stockStatus: string | null;
  hasSupplier: boolean;
}

export function ProductsTable({ products }: { products: Row[] }) {
  const columns: ColumnDef<Row>[] = [
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
    { key: "barcode", header: "Barcode", render: (r) => r.primaryBarcode ?? "—", sortValue: (r) => r.primaryBarcode },
    { key: "asin", header: "ASIN", render: (r) => r.asin ?? "—", sortValue: (r) => r.asin },
    { key: "sku", header: "SKU", render: (r) => r.amazonSku ?? r.oaSku ?? "—" },
    { key: "source", header: "Source", render: (r) => <StatusBadge status={r.catalogSource === "OA_USA" ? "OA_USA" : "AMAZON"} label={r.catalogSource === "OA_USA" ? "OA USA" : "Amazon"} /> },
    { key: "bsr", header: "BSR", render: (r) => formatNumber(r.bsr), sortValue: (r) => r.bsr, align: "right" },
    { key: "t30", header: "T30 Sales", render: (r) => formatNumber(r.unitsShippedT30), sortValue: (r) => r.unitsShippedT30, align: "right" },
    { key: "amazon", header: "Amazon Qty", render: (r) => formatNumber(r.amazonAvailableQty), sortValue: (r) => r.amazonAvailableQty, align: "right" },
    { key: "rover", header: "Rover Qty", render: (r) => formatNumber(r.roverQty), sortValue: (r) => r.roverQty, align: "right" },
    { key: "office", header: "Office Qty", render: (r) => formatNumber(r.officeQty), sortValue: (r) => r.officeQty, align: "right" },
    { key: "cost", header: "Cost", render: (r) => formatMoney(r.currentCost), sortValue: (r) => (r.currentCost ? Number(r.currentCost) : null), align: "right" },
    { key: "price", header: "Our Price", render: (r) => formatMoney(r.ourPrice), sortValue: (r) => (r.ourPrice ? Number(r.ourPrice) : null), align: "right" },
    { key: "stock_status", header: "Stock", render: (r) => <StatusBadge status={r.stockStatus} /> },
    { key: "profit_status", header: "Profit", render: (r) => <StatusBadge status={r.profitStatus} /> },
    { key: "reorder_status", header: "Reorder Status", render: (r) => <StatusBadge status={r.reorderStatus} /> },
    { key: "supplier", header: "Supplier", render: (r) => (r.hasSupplier ? <StatusBadge status="SUPPLIER_AVAILABLE" label="Available" /> : <StatusBadge status="SUPPLIER_NOT_FOUND" label="None" />) },
    { key: "value", header: "Inventory Value", render: (r) => formatMoney(r.inventoryValue), sortValue: (r) => (r.inventoryValue ? Number(r.inventoryValue) : null), align: "right" },
  ];

  return (
    <DataTable
      columns={columns}
      rows={products}
      rowKey={(r) => r.id}
      rowHref={(r) => `/products/${r.id}`}
      searchPlaceholder="Search title, brand, barcode, ASIN, SKU..."
      searchFields={(r) => `${r.title} ${r.brand ?? ""} ${r.primaryBarcode ?? ""} ${r.asin ?? ""} ${r.amazonSku ?? ""} ${r.oaSku ?? ""}`}
    />
  );
}
