"use client";

import { useState, useTransition } from "react";
import { DataTable, type ColumnDef } from "../../../components/DataTable";
import { StatusBadge } from "../../../components/StatusBadge";
import { formatDate, formatDateTime, formatMoney, formatNumber, formatPct, titleCase } from "../../../lib/format";
import { ExportCsvButton } from "./ExportCsvButton";
import { loadReportAction } from "../../actions/report-actions";
import type { ReportCategory, ReportCatalogEntry } from "../../../lib/reports-catalog";
import type {
  InventoryValuationRow,
  ProfitabilityRow,
  ReorderNeedsRow,
  SupplierSpendRow,
  LocationInventoryRow,
  TotalInventoryRow,
  BrandInventoryRow,
  StockStatusReportRow,
  ProfitFilterRow,
  PurchasePriceChangeRow,
  InvoiceDiscrepancyRow,
  SupplierAvailabilityRow,
} from "../../../lib/queries/reports";
import type { SupplierComparisonRow } from "../../../lib/queries/supplier-comparison";
import type { PurchaseHistoryRow } from "../../../lib/queries/purchase-history";
import type { StockMovementRow } from "../../../lib/queries/stock-movements";

type Catalog = ReportCategory[];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

/** Every shape's column set + CSV mapping + summary stats, keyed once so adding a new report
 * to lib/reports-catalog.ts only needs a query function + a catalog entry, not new UI code. */
const RENDERERS: Record<string, (data: unknown) => { rows: unknown[]; columns: ColumnDef<never>[]; csvColumns: { header: string; value: (r: never) => string | number | null | undefined }[]; stats: { label: string; value: string }[]; rowHref?: (r: never) => string; search: (r: never) => string }> = {
  valuation: (data) => {
    const d = data as { rows: InventoryValuationRow[]; totalValue: number; totalUnits: number };
    return {
      rows: d.rows,
      stats: [
        { label: "Total Inventory Value", value: formatMoney(d.totalValue) },
        { label: "Total Units On Hand", value: formatNumber(d.totalUnits) },
      ],
      rowHref: (r: InventoryValuationRow) => `/products/${r.id}`,
      search: (r: InventoryValuationRow) => `${r.title} ${r.barcode ?? ""}`,
      columns: [
        { key: "title", header: "Product", render: (r: InventoryValuationRow) => <div className="max-w-[240px] truncate">{r.title}</div>, sortValue: (r: InventoryValuationRow) => r.title },
        { key: "barcode", header: "Barcode", render: (r: InventoryValuationRow) => r.barcode ?? "—" },
        { key: "amazon", header: "Amazon Qty", render: (r: InventoryValuationRow) => formatNumber(r.amazonQty), sortValue: (r: InventoryValuationRow) => r.amazonQty, align: "right" },
        { key: "rover", header: "Rover Qty", render: (r: InventoryValuationRow) => formatNumber(r.roverQty), sortValue: (r: InventoryValuationRow) => r.roverQty, align: "right" },
        { key: "office", header: "Office Qty", render: (r: InventoryValuationRow) => formatNumber(r.officeQty), sortValue: (r: InventoryValuationRow) => r.officeQty, align: "right" },
        { key: "total", header: "Total Qty", render: (r: InventoryValuationRow) => formatNumber(r.totalQty), sortValue: (r: InventoryValuationRow) => r.totalQty, align: "right" },
        { key: "unitCost", header: "Unit Cost", render: (r: InventoryValuationRow) => (r.unitCost != null ? formatMoney(r.unitCost) : "—"), sortValue: (r: InventoryValuationRow) => r.unitCost ?? 0, align: "right" },
        { key: "value", header: "Inventory Value", render: (r: InventoryValuationRow) => formatMoney(r.inventoryValue), sortValue: (r: InventoryValuationRow) => r.inventoryValue, align: "right" },
      ] as unknown as ColumnDef<never>[],
      csvColumns: [
        { header: "Product", value: (r: InventoryValuationRow) => r.title },
        { header: "Barcode", value: (r: InventoryValuationRow) => r.barcode },
        { header: "Amazon Qty", value: (r: InventoryValuationRow) => r.amazonQty },
        { header: "Rover Qty", value: (r: InventoryValuationRow) => r.roverQty },
        { header: "Office Qty", value: (r: InventoryValuationRow) => r.officeQty },
        { header: "Total Qty", value: (r: InventoryValuationRow) => r.totalQty },
        { header: "Unit Cost", value: (r: InventoryValuationRow) => r.unitCost },
        { header: "Inventory Value", value: (r: InventoryValuationRow) => r.inventoryValue },
      ] as unknown as { header: string; value: (r: never) => string | number | null | undefined }[],
    };
  },

  profitability: (data) => {
    const d = data as { rows: ProfitabilityRow[]; totalEstimatedProfit30d: number };
    return {
      rows: d.rows,
      stats: [{ label: "Estimated 30-Day Profit (catalog)", value: formatMoney(d.totalEstimatedProfit30d) }],
      rowHref: (r: ProfitabilityRow) => `/products/${r.id}`,
      search: (r: ProfitabilityRow) => `${r.title} ${r.barcode ?? ""}`,
      columns: [
        { key: "title", header: "Product", render: (r: ProfitabilityRow) => <div className="max-w-[240px] truncate">{r.title}</div>, sortValue: (r: ProfitabilityRow) => r.title },
        { key: "barcode", header: "Barcode", render: (r: ProfitabilityRow) => r.barcode ?? "—" },
        { key: "price", header: "Selling Price", render: (r: ProfitabilityRow) => (r.sellingPrice != null ? formatMoney(r.sellingPrice) : "—"), sortValue: (r: ProfitabilityRow) => r.sellingPrice ?? 0, align: "right" },
        { key: "cost", header: "Cost", render: (r: ProfitabilityRow) => (r.cost != null ? formatMoney(r.cost) : "—"), sortValue: (r: ProfitabilityRow) => r.cost ?? 0, align: "right" },
        { key: "profit", header: "Profit/Unit", render: (r: ProfitabilityRow) => (r.profitPerUnit != null ? formatMoney(r.profitPerUnit) : "—"), sortValue: (r: ProfitabilityRow) => r.profitPerUnit ?? 0, align: "right" },
        { key: "margin", header: "Margin", render: (r: ProfitabilityRow) => (r.marginPct != null ? formatPct(r.marginPct * 100) : "—"), sortValue: (r: ProfitabilityRow) => r.marginPct ?? 0, align: "right" },
        { key: "roi", header: "ROI", render: (r: ProfitabilityRow) => (r.roiPct != null ? formatPct(r.roiPct) : "—"), sortValue: (r: ProfitabilityRow) => r.roiPct ?? 0, align: "right" },
        { key: "status", header: "Status", render: (r: ProfitabilityRow) => <StatusBadge status={r.profitStatus} label={titleCase(r.profitStatus)} /> },
        { key: "t30", header: "Units/30d", render: (r: ProfitabilityRow) => formatNumber(r.unitsShippedT30 ?? 0), sortValue: (r: ProfitabilityRow) => r.unitsShippedT30 ?? 0, align: "right" },
      ] as unknown as ColumnDef<never>[],
      csvColumns: [
        { header: "Product", value: (r: ProfitabilityRow) => r.title },
        { header: "Barcode", value: (r: ProfitabilityRow) => r.barcode },
        { header: "Selling Price", value: (r: ProfitabilityRow) => r.sellingPrice },
        { header: "Cost", value: (r: ProfitabilityRow) => r.cost },
        { header: "Profit/Unit", value: (r: ProfitabilityRow) => r.profitPerUnit },
        { header: "Margin %", value: (r: ProfitabilityRow) => (r.marginPct != null ? r.marginPct * 100 : null) },
        { header: "ROI %", value: (r: ProfitabilityRow) => r.roiPct },
        { header: "Status", value: (r: ProfitabilityRow) => r.profitStatus },
        { header: "Units/30d", value: (r: ProfitabilityRow) => r.unitsShippedT30 },
      ] as unknown as { header: string; value: (r: never) => string | number | null | undefined }[],
    };
  },

  reorder: (data) => {
    const d = data as { rows: ReorderNeedsRow[]; totalRecommendedCost: number };
    return {
      rows: d.rows,
      stats: [{ label: "Total Expected Reorder Cost", value: formatMoney(d.totalRecommendedCost) }],
      rowHref: (r: ReorderNeedsRow) => `/products/${r.id}`,
      search: (r: ReorderNeedsRow) => `${r.title} ${r.barcode ?? ""}`,
      columns: [
        { key: "title", header: "Product", render: (r: ReorderNeedsRow) => <div className="max-w-[220px] truncate">{r.title}</div>, sortValue: (r: ReorderNeedsRow) => r.title },
        { key: "priority", header: "Priority", render: (r: ReorderNeedsRow) => <StatusBadge status={r.priority} label={r.priority} /> },
        { key: "reorderStatus", header: "Reorder Status", render: (r: ReorderNeedsRow) => <StatusBadge status={r.reorderStatus} label={titleCase(r.reorderStatus)} /> },
        { key: "stockStatus", header: "Stock Status", render: (r: ReorderNeedsRow) => <StatusBadge status={r.stockStatus} label={titleCase(r.stockStatus ?? undefined)} /> },
        { key: "days", header: "Days of Stock", render: (r: ReorderNeedsRow) => (r.daysOfStock != null ? r.daysOfStock.toFixed(1) : "—"), sortValue: (r: ReorderNeedsRow) => r.daysOfStock ?? 0, align: "right" },
        { key: "qty", header: "Recommended Qty", render: (r: ReorderNeedsRow) => formatNumber(r.recommendedQty30), sortValue: (r: ReorderNeedsRow) => r.recommendedQty30, align: "right" },
        { key: "supplier", header: "Best Supplier", render: (r: ReorderNeedsRow) => r.bestSupplierName ?? "—" },
        { key: "cost", header: "Expected Cost", render: (r: ReorderNeedsRow) => (r.expectedTotalCost != null ? formatMoney(r.expectedTotalCost) : "—"), sortValue: (r: ReorderNeedsRow) => r.expectedTotalCost ?? 0, align: "right" },
        { key: "profit", header: "Expected Profit", render: (r: ReorderNeedsRow) => (r.expectedProfit != null ? formatMoney(r.expectedProfit) : "—"), sortValue: (r: ReorderNeedsRow) => r.expectedProfit ?? 0, align: "right" },
      ] as unknown as ColumnDef<never>[],
      csvColumns: [
        { header: "Product", value: (r: ReorderNeedsRow) => r.title },
        { header: "Barcode", value: (r: ReorderNeedsRow) => r.barcode },
        { header: "Priority", value: (r: ReorderNeedsRow) => r.priority },
        { header: "Reorder Status", value: (r: ReorderNeedsRow) => r.reorderStatus },
        { header: "Stock Status", value: (r: ReorderNeedsRow) => r.stockStatus },
        { header: "Days of Stock", value: (r: ReorderNeedsRow) => r.daysOfStock },
        { header: "Recommended Qty", value: (r: ReorderNeedsRow) => r.recommendedQty30 },
        { header: "Best Supplier", value: (r: ReorderNeedsRow) => r.bestSupplierName },
        { header: "Expected Cost", value: (r: ReorderNeedsRow) => r.expectedTotalCost },
        { header: "Expected Profit", value: (r: ReorderNeedsRow) => r.expectedProfit },
      ] as unknown as { header: string; value: (r: never) => string | number | null | undefined }[],
    };
  },

  supplierSpend: (data) => {
    const d = data as { rows: SupplierSpendRow[]; grandTotalSpend: number };
    return {
      rows: d.rows,
      stats: [{ label: "Grand Total Spend", value: formatMoney(d.grandTotalSpend) }],
      rowHref: (r: SupplierSpendRow) => `/suppliers/${r.id}`,
      search: (r: SupplierSpendRow) => r.name,
      columns: [
        { key: "name", header: "Supplier", render: (r: SupplierSpendRow) => r.name, sortValue: (r: SupplierSpendRow) => r.name },
        { key: "active", header: "Active", render: (r: SupplierSpendRow) => (r.isActive ? "Yes" : "No") },
        { key: "txns", header: "Transactions", render: (r: SupplierSpendRow) => formatNumber(r.transactionCount), sortValue: (r: SupplierSpendRow) => r.transactionCount, align: "right" },
        { key: "units", header: "Units", render: (r: SupplierSpendRow) => formatNumber(r.totalUnits), sortValue: (r: SupplierSpendRow) => r.totalUnits, align: "right" },
        { key: "spend", header: "Total Spend", render: (r: SupplierSpendRow) => formatMoney(r.totalSpend), sortValue: (r: SupplierSpendRow) => r.totalSpend, align: "right" },
        { key: "avg", header: "Avg Unit Cost", render: (r: SupplierSpendRow) => (r.avgUnitCost != null ? formatMoney(r.avgUnitCost) : "—"), sortValue: (r: SupplierSpendRow) => r.avgUnitCost ?? 0, align: "right" },
        { key: "last", header: "Last Purchase", render: (r: SupplierSpendRow) => formatDate(r.lastPurchaseDate), sortValue: (r: SupplierSpendRow) => r.lastPurchaseDate ?? "" },
      ] as unknown as ColumnDef<never>[],
      csvColumns: [
        { header: "Supplier", value: (r: SupplierSpendRow) => r.name },
        { header: "Active", value: (r: SupplierSpendRow) => (r.isActive ? "Yes" : "No") },
        { header: "Transactions", value: (r: SupplierSpendRow) => r.transactionCount },
        { header: "Units", value: (r: SupplierSpendRow) => r.totalUnits },
        { header: "Total Spend", value: (r: SupplierSpendRow) => r.totalSpend },
        { header: "Avg Unit Cost", value: (r: SupplierSpendRow) => r.avgUnitCost },
        { header: "Last Purchase", value: (r: SupplierSpendRow) => r.lastPurchaseDate },
      ] as unknown as { header: string; value: (r: never) => string | number | null | undefined }[],
    };
  },

  location: (data) => {
    const d = data as { rows: LocationInventoryRow[]; totalQty: number; totalValue: number };
    return {
      rows: d.rows,
      stats: [
        { label: "Total Units", value: formatNumber(d.totalQty) },
        { label: "Total Value", value: formatMoney(d.totalValue) },
      ],
      rowHref: (r: LocationInventoryRow) => `/products/${r.id}`,
      search: (r: LocationInventoryRow) => `${r.title} ${r.barcode ?? ""} ${r.brand ?? ""}`,
      columns: [
        { key: "title", header: "Product", render: (r: LocationInventoryRow) => <div className="max-w-[240px] truncate">{r.title}</div>, sortValue: (r: LocationInventoryRow) => r.title },
        { key: "barcode", header: "Barcode", render: (r: LocationInventoryRow) => r.barcode ?? "—" },
        { key: "brand", header: "Brand", render: (r: LocationInventoryRow) => r.brand ?? "—" },
        { key: "qty", header: "Qty", render: (r: LocationInventoryRow) => formatNumber(r.qty), sortValue: (r: LocationInventoryRow) => r.qty, align: "right" },
        { key: "unitCost", header: "Unit Cost", render: (r: LocationInventoryRow) => (r.unitCost != null ? formatMoney(r.unitCost) : "—"), sortValue: (r: LocationInventoryRow) => r.unitCost ?? 0, align: "right" },
        { key: "value", header: "Value", render: (r: LocationInventoryRow) => formatMoney(r.value), sortValue: (r: LocationInventoryRow) => r.value, align: "right" },
      ] as unknown as ColumnDef<never>[],
      csvColumns: [
        { header: "Product", value: (r: LocationInventoryRow) => r.title },
        { header: "Barcode", value: (r: LocationInventoryRow) => r.barcode },
        { header: "Brand", value: (r: LocationInventoryRow) => r.brand },
        { header: "Qty", value: (r: LocationInventoryRow) => r.qty },
        { header: "Unit Cost", value: (r: LocationInventoryRow) => r.unitCost },
        { header: "Value", value: (r: LocationInventoryRow) => r.value },
      ] as unknown as { header: string; value: (r: never) => string | number | null | undefined }[],
    };
  },

  totalInventory: (data) => {
    const d = data as { rows: TotalInventoryRow[]; totalUnits: number };
    return {
      rows: d.rows,
      stats: [{ label: "Total Units (All Locations)", value: formatNumber(d.totalUnits) }],
      rowHref: (r: TotalInventoryRow) => `/products/${r.id}`,
      search: (r: TotalInventoryRow) => `${r.title} ${r.barcode ?? ""} ${r.brand ?? ""}`,
      columns: [
        { key: "title", header: "Product", render: (r: TotalInventoryRow) => <div className="max-w-[220px] truncate">{r.title}</div>, sortValue: (r: TotalInventoryRow) => r.title },
        { key: "barcode", header: "Barcode", render: (r: TotalInventoryRow) => r.barcode ?? "—" },
        { key: "brand", header: "Brand", render: (r: TotalInventoryRow) => r.brand ?? "—" },
        { key: "amazon", header: "Amazon", render: (r: TotalInventoryRow) => formatNumber(r.amazonQty), sortValue: (r: TotalInventoryRow) => r.amazonQty, align: "right" },
        { key: "rover", header: "Rover", render: (r: TotalInventoryRow) => formatNumber(r.roverQty), sortValue: (r: TotalInventoryRow) => r.roverQty, align: "right" },
        { key: "office", header: "Office", render: (r: TotalInventoryRow) => formatNumber(r.officeQty), sortValue: (r: TotalInventoryRow) => r.officeQty, align: "right" },
        { key: "incoming", header: "Incoming", render: (r: TotalInventoryRow) => formatNumber(r.incomingQty), sortValue: (r: TotalInventoryRow) => r.incomingQty, align: "right" },
        { key: "total", header: "Total", render: (r: TotalInventoryRow) => formatNumber(r.totalQty), sortValue: (r: TotalInventoryRow) => r.totalQty, align: "right" },
        { key: "reorderStatus", header: "Reorder Status", render: (r: TotalInventoryRow) => <StatusBadge status={r.reorderStatus} label={titleCase(r.reorderStatus)} /> },
        { key: "stockStatus", header: "Stock Status", render: (r: TotalInventoryRow) => <StatusBadge status={r.stockStatus} label={titleCase(r.stockStatus ?? undefined)} /> },
      ] as unknown as ColumnDef<never>[],
      csvColumns: [
        { header: "Product", value: (r: TotalInventoryRow) => r.title },
        { header: "Barcode", value: (r: TotalInventoryRow) => r.barcode },
        { header: "Brand", value: (r: TotalInventoryRow) => r.brand },
        { header: "Amazon Qty", value: (r: TotalInventoryRow) => r.amazonQty },
        { header: "Rover Qty", value: (r: TotalInventoryRow) => r.roverQty },
        { header: "Office Qty", value: (r: TotalInventoryRow) => r.officeQty },
        { header: "Incoming Qty", value: (r: TotalInventoryRow) => r.incomingQty },
        { header: "Total Qty", value: (r: TotalInventoryRow) => r.totalQty },
        { header: "Reorder Status", value: (r: TotalInventoryRow) => r.reorderStatus },
        { header: "Stock Status", value: (r: TotalInventoryRow) => r.stockStatus },
      ] as unknown as { header: string; value: (r: never) => string | number | null | undefined }[],
    };
  },

  brand: (data) => {
    const d = data as { rows: BrandInventoryRow[]; totalValue: number };
    return {
      rows: d.rows,
      stats: [{ label: "Total Inventory Value", value: formatMoney(d.totalValue) }],
      search: (r: BrandInventoryRow) => r.brand,
      columns: [
        { key: "brand", header: "Brand", render: (r: BrandInventoryRow) => r.brand, sortValue: (r: BrandInventoryRow) => r.brand },
        { key: "count", header: "Products", render: (r: BrandInventoryRow) => formatNumber(r.productCount), sortValue: (r: BrandInventoryRow) => r.productCount, align: "right" },
        { key: "amazon", header: "Amazon Qty", render: (r: BrandInventoryRow) => formatNumber(r.amazonQty), sortValue: (r: BrandInventoryRow) => r.amazonQty, align: "right" },
        { key: "rover", header: "Rover Qty", render: (r: BrandInventoryRow) => formatNumber(r.roverQty), sortValue: (r: BrandInventoryRow) => r.roverQty, align: "right" },
        { key: "office", header: "Office Qty", render: (r: BrandInventoryRow) => formatNumber(r.officeQty), sortValue: (r: BrandInventoryRow) => r.officeQty, align: "right" },
        { key: "total", header: "Total Qty", render: (r: BrandInventoryRow) => formatNumber(r.totalQty), sortValue: (r: BrandInventoryRow) => r.totalQty, align: "right" },
        { key: "value", header: "Inventory Value", render: (r: BrandInventoryRow) => formatMoney(r.inventoryValue), sortValue: (r: BrandInventoryRow) => r.inventoryValue, align: "right" },
      ] as unknown as ColumnDef<never>[],
      csvColumns: [
        { header: "Brand", value: (r: BrandInventoryRow) => r.brand },
        { header: "Products", value: (r: BrandInventoryRow) => r.productCount },
        { header: "Amazon Qty", value: (r: BrandInventoryRow) => r.amazonQty },
        { header: "Rover Qty", value: (r: BrandInventoryRow) => r.roverQty },
        { header: "Office Qty", value: (r: BrandInventoryRow) => r.officeQty },
        { header: "Total Qty", value: (r: BrandInventoryRow) => r.totalQty },
        { header: "Inventory Value", value: (r: BrandInventoryRow) => r.inventoryValue },
      ] as unknown as { header: string; value: (r: never) => string | number | null | undefined }[],
    };
  },

  stockStatus: (data) => {
    const rows = data as StockStatusReportRow[];
    return {
      rows,
      stats: [{ label: "Products", value: formatNumber(rows.length) }],
      rowHref: (r: StockStatusReportRow) => `/products/${r.id}`,
      search: (r: StockStatusReportRow) => `${r.title} ${r.barcode ?? ""} ${r.brand ?? ""}`,
      columns: [
        { key: "title", header: "Product", render: (r: StockStatusReportRow) => <div className="max-w-[220px] truncate">{r.title}</div>, sortValue: (r: StockStatusReportRow) => r.title },
        { key: "barcode", header: "Barcode", render: (r: StockStatusReportRow) => r.barcode ?? "—" },
        { key: "bsr", header: "BSR", render: (r: StockStatusReportRow) => r.bsr ?? "—", sortValue: (r: StockStatusReportRow) => r.bsr ?? Infinity, align: "right" },
        { key: "t30", header: "T30 Sales", render: (r: StockStatusReportRow) => formatNumber(r.t30Sales), sortValue: (r: StockStatusReportRow) => r.t30Sales, align: "right" },
        { key: "amazon", header: "Amazon", render: (r: StockStatusReportRow) => formatNumber(r.amazonQty), sortValue: (r: StockStatusReportRow) => r.amazonQty, align: "right" },
        { key: "rover", header: "Rover", render: (r: StockStatusReportRow) => formatNumber(r.roverQty), sortValue: (r: StockStatusReportRow) => r.roverQty, align: "right" },
        { key: "days", header: "Days of Stock", render: (r: StockStatusReportRow) => (r.daysOfStock != null ? r.daysOfStock.toFixed(1) : "—"), sortValue: (r: StockStatusReportRow) => r.daysOfStock ?? 0, align: "right" },
        { key: "stockStatus", header: "Stock Status", render: (r: StockStatusReportRow) => <StatusBadge status={r.stockStatus} label={titleCase(r.stockStatus ?? undefined)} /> },
        { key: "priority", header: "Priority", render: (r: StockStatusReportRow) => <StatusBadge status={r.priority ?? undefined} label={r.priority ?? "—"} /> },
        { key: "qty", header: "Recommended Qty", render: (r: StockStatusReportRow) => formatNumber(r.recommendedQty30), sortValue: (r: StockStatusReportRow) => r.recommendedQty30, align: "right" },
      ] as unknown as ColumnDef<never>[],
      csvColumns: [
        { header: "Product", value: (r: StockStatusReportRow) => r.title },
        { header: "Barcode", value: (r: StockStatusReportRow) => r.barcode },
        { header: "BSR", value: (r: StockStatusReportRow) => r.bsr },
        { header: "T30 Sales", value: (r: StockStatusReportRow) => r.t30Sales },
        { header: "Amazon Qty", value: (r: StockStatusReportRow) => r.amazonQty },
        { header: "Rover Qty", value: (r: StockStatusReportRow) => r.roverQty },
        { header: "Office Qty", value: (r: StockStatusReportRow) => r.officeQty },
        { header: "Days of Stock", value: (r: StockStatusReportRow) => r.daysOfStock },
        { header: "Stock Status", value: (r: StockStatusReportRow) => r.stockStatus },
        { header: "Priority", value: (r: StockStatusReportRow) => r.priority },
        { header: "Recommended Qty", value: (r: StockStatusReportRow) => r.recommendedQty30 },
      ] as unknown as { header: string; value: (r: never) => string | number | null | undefined }[],
    };
  },

  profitFilter: (data) => {
    const rows = data as ProfitFilterRow[];
    return {
      rows,
      stats: [{ label: "Products", value: formatNumber(rows.length) }],
      rowHref: (r: ProfitFilterRow) => `/products/${r.id}`,
      search: (r: ProfitFilterRow) => `${r.title} ${r.barcode ?? ""} ${r.brand ?? ""}`,
      columns: [
        { key: "title", header: "Product", render: (r: ProfitFilterRow) => <div className="max-w-[240px] truncate">{r.title}</div>, sortValue: (r: ProfitFilterRow) => r.title },
        { key: "barcode", header: "Barcode", render: (r: ProfitFilterRow) => r.barcode ?? "—" },
        { key: "cost", header: "Cost", render: (r: ProfitFilterRow) => (r.unitCost != null ? formatMoney(r.unitCost) : "—"), sortValue: (r: ProfitFilterRow) => r.unitCost ?? 0, align: "right" },
        { key: "profit", header: "Profit/Unit", render: (r: ProfitFilterRow) => (r.profitPerUnit != null ? formatMoney(r.profitPerUnit) : "—"), sortValue: (r: ProfitFilterRow) => r.profitPerUnit ?? 0, align: "right" },
        { key: "roi", header: "ROI", render: (r: ProfitFilterRow) => (r.roiPct != null ? formatPct(r.roiPct) : "—"), sortValue: (r: ProfitFilterRow) => r.roiPct ?? 0, align: "right" },
        { key: "status", header: "Status", render: (r: ProfitFilterRow) => <StatusBadge status={r.profitStatus} label={titleCase(r.profitStatus)} /> },
        { key: "t30", header: "T30 Sales", render: (r: ProfitFilterRow) => formatNumber(r.t30Sales), sortValue: (r: ProfitFilterRow) => r.t30Sales, align: "right" },
      ] as unknown as ColumnDef<never>[],
      csvColumns: [
        { header: "Product", value: (r: ProfitFilterRow) => r.title },
        { header: "Barcode", value: (r: ProfitFilterRow) => r.barcode },
        { header: "Cost", value: (r: ProfitFilterRow) => r.unitCost },
        { header: "Profit/Unit", value: (r: ProfitFilterRow) => r.profitPerUnit },
        { header: "ROI %", value: (r: ProfitFilterRow) => r.roiPct },
        { header: "Status", value: (r: ProfitFilterRow) => r.profitStatus },
        { header: "T30 Sales", value: (r: ProfitFilterRow) => r.t30Sales },
      ] as unknown as { header: string; value: (r: never) => string | number | null | undefined }[],
    };
  },

  priceChanges: (data) => {
    const d = data as { rows: PurchasePriceChangeRow[] };
    return {
      rows: d.rows,
      stats: [{ label: "Recorded Changes", value: formatNumber(d.rows.length) }],
      rowHref: (r: PurchasePriceChangeRow) => `/products/${r.productId}`,
      search: (r: PurchasePriceChangeRow) => `${r.productTitle} ${r.productBarcode ?? ""} ${r.supplierName}`,
      columns: [
        { key: "date", header: "Date", render: (r: PurchasePriceChangeRow) => formatDate(r.effectiveDate), sortValue: (r: PurchasePriceChangeRow) => r.effectiveDate },
        { key: "product", header: "Product", render: (r: PurchasePriceChangeRow) => <div className="max-w-[220px] truncate">{r.productTitle}</div>, sortValue: (r: PurchasePriceChangeRow) => r.productTitle },
        { key: "supplier", header: "Supplier", render: (r: PurchasePriceChangeRow) => r.supplierName, sortValue: (r: PurchasePriceChangeRow) => r.supplierName },
        { key: "old", header: "Old Price", render: (r: PurchasePriceChangeRow) => formatMoney(r.oldPrice), sortValue: (r: PurchasePriceChangeRow) => r.oldPrice, align: "right" },
        { key: "new", header: "New Price", render: (r: PurchasePriceChangeRow) => formatMoney(r.newPrice), sortValue: (r: PurchasePriceChangeRow) => r.newPrice, align: "right" },
        {
          key: "diff",
          header: "Change",
          render: (r: PurchasePriceChangeRow) => (
            <span className={r.priceDiff > 0 ? "text-red-600" : "text-green-600"}>
              {r.priceDiff > 0 ? "+" : ""}
              {formatMoney(r.priceDiff)} {r.priceDiffPct != null ? `(${r.priceDiffPct > 0 ? "+" : ""}${(r.priceDiffPct * 100).toFixed(1)}%)` : ""}
            </span>
          ),
          sortValue: (r: PurchasePriceChangeRow) => r.priceDiff,
          align: "right",
        },
      ] as unknown as ColumnDef<never>[],
      csvColumns: [
        { header: "Date", value: (r: PurchasePriceChangeRow) => r.effectiveDate },
        { header: "Product", value: (r: PurchasePriceChangeRow) => r.productTitle },
        { header: "Barcode", value: (r: PurchasePriceChangeRow) => r.productBarcode },
        { header: "Supplier", value: (r: PurchasePriceChangeRow) => r.supplierName },
        { header: "Old Price", value: (r: PurchasePriceChangeRow) => r.oldPrice },
        { header: "New Price", value: (r: PurchasePriceChangeRow) => r.newPrice },
        { header: "Change", value: (r: PurchasePriceChangeRow) => r.priceDiff },
        { header: "Change %", value: (r: PurchasePriceChangeRow) => (r.priceDiffPct != null ? r.priceDiffPct * 100 : null) },
      ] as unknown as { header: string; value: (r: never) => string | number | null | undefined }[],
    };
  },

  invoiceDiscrepancies: (data) => {
    const d = data as { rows: InvoiceDiscrepancyRow[] };
    return {
      rows: d.rows,
      stats: [{ label: "Discrepant Lines", value: formatNumber(d.rows.length) }],
      rowHref: (r: InvoiceDiscrepancyRow) => `/invoices/${r.invoiceId}`,
      search: (r: InvoiceDiscrepancyRow) => `${r.productTitle ?? ""} ${r.barcodeRaw ?? ""} ${r.invoiceNumber} ${r.supplierName ?? ""}`,
      columns: [
        { key: "invoice", header: "Invoice #", render: (r: InvoiceDiscrepancyRow) => r.invoiceNumber, sortValue: (r: InvoiceDiscrepancyRow) => r.invoiceNumber },
        { key: "date", header: "Date", render: (r: InvoiceDiscrepancyRow) => formatDate(r.invoiceDate), sortValue: (r: InvoiceDiscrepancyRow) => r.invoiceDate ?? "" },
        { key: "supplier", header: "Supplier", render: (r: InvoiceDiscrepancyRow) => r.supplierName ?? "—" },
        { key: "product", header: "Product", render: (r: InvoiceDiscrepancyRow) => <div className="max-w-[200px] truncate">{r.productTitle ?? r.barcodeRaw ?? "Unmatched"}</div> },
        { key: "qty", header: "Qty", render: (r: InvoiceDiscrepancyRow) => formatNumber(r.invoiceQty), sortValue: (r: InvoiceDiscrepancyRow) => r.invoiceQty, align: "right" },
        { key: "price", header: "Invoice Price", render: (r: InvoiceDiscrepancyRow) => formatMoney(r.invoicePrice), sortValue: (r: InvoiceDiscrepancyRow) => r.invoicePrice, align: "right" },
        { key: "ref", header: "Reference Price", render: (r: InvoiceDiscrepancyRow) => (r.referencePrice != null ? formatMoney(r.referencePrice) : "—"), sortValue: (r: InvoiceDiscrepancyRow) => r.referencePrice ?? 0, align: "right" },
        {
          key: "diff",
          header: "Diff",
          render: (r: InvoiceDiscrepancyRow) =>
            r.priceDiff != null ? (
              <span className={r.priceDiff > 0 ? "text-red-600" : "text-green-600"}>
                {r.priceDiff > 0 ? "+" : ""}
                {formatMoney(r.priceDiff)} {r.priceDiffPct != null ? `(${r.priceDiffPct > 0 ? "+" : ""}${(r.priceDiffPct * 100).toFixed(1)}%)` : ""}
              </span>
            ) : (
              "—"
            ),
          sortValue: (r: InvoiceDiscrepancyRow) => r.priceDiff ?? 0,
          align: "right",
        },
        { key: "status", header: "Status", render: (r: InvoiceDiscrepancyRow) => <StatusBadge status={r.status} label={titleCase(r.status)} /> },
      ] as unknown as ColumnDef<never>[],
      csvColumns: [
        { header: "Invoice #", value: (r: InvoiceDiscrepancyRow) => r.invoiceNumber },
        { header: "Date", value: (r: InvoiceDiscrepancyRow) => r.invoiceDate },
        { header: "Supplier", value: (r: InvoiceDiscrepancyRow) => r.supplierName },
        { header: "Product", value: (r: InvoiceDiscrepancyRow) => r.productTitle },
        { header: "Barcode", value: (r: InvoiceDiscrepancyRow) => r.barcodeRaw },
        { header: "Qty", value: (r: InvoiceDiscrepancyRow) => r.invoiceQty },
        { header: "Invoice Price", value: (r: InvoiceDiscrepancyRow) => r.invoicePrice },
        { header: "Reference Price", value: (r: InvoiceDiscrepancyRow) => r.referencePrice },
        { header: "Diff", value: (r: InvoiceDiscrepancyRow) => r.priceDiff },
        { header: "Diff %", value: (r: InvoiceDiscrepancyRow) => (r.priceDiffPct != null ? r.priceDiffPct * 100 : null) },
        { header: "Status", value: (r: InvoiceDiscrepancyRow) => r.status },
      ] as unknown as { header: string; value: (r: never) => string | number | null | undefined }[],
    };
  },

  supplierAvailability: (data) => {
    const d = data as { rows: SupplierAvailabilityRow[]; counts: Record<string, number> };
    return {
      rows: d.rows,
      stats: Object.entries(d.counts).map(([k, v]) => ({ label: titleCase(k), value: formatNumber(v) })),
      rowHref: (r: SupplierAvailabilityRow) => `/products/${r.productId}`,
      search: (r: SupplierAvailabilityRow) => `${r.productTitle} ${r.barcode ?? ""} ${r.supplierName}`,
      columns: [
        { key: "supplier", header: "Supplier", render: (r: SupplierAvailabilityRow) => r.supplierName, sortValue: (r: SupplierAvailabilityRow) => r.supplierName },
        { key: "product", header: "Product", render: (r: SupplierAvailabilityRow) => <div className="max-w-[200px] truncate">{r.productTitle}</div>, sortValue: (r: SupplierAvailabilityRow) => r.productTitle },
        { key: "barcode", header: "Barcode", render: (r: SupplierAvailabilityRow) => r.barcode ?? "—" },
        { key: "price", header: "Price", render: (r: SupplierAvailabilityRow) => formatMoney(r.price), sortValue: (r: SupplierAvailabilityRow) => r.price, align: "right" },
        { key: "stock", header: "Supplier Stock", render: (r: SupplierAvailabilityRow) => r.stockQty ?? "—", sortValue: (r: SupplierAvailabilityRow) => r.stockQty ?? 0, align: "right" },
        { key: "moq", header: "MOQ", render: (r: SupplierAvailabilityRow) => r.moq ?? "—", align: "right" },
        { key: "lead", header: "Lead Time", render: (r: SupplierAvailabilityRow) => (r.leadTimeDays != null ? `${r.leadTimeDays}d` : "—"), align: "right" },
        { key: "updated", header: "Last Updated", render: (r: SupplierAvailabilityRow) => formatDateTime(r.lastUpdated), sortValue: (r: SupplierAvailabilityRow) => r.lastUpdated },
        { key: "outcome", header: "Opportunity", render: (r: SupplierAvailabilityRow) => <StatusBadge status={r.matchOutcome} label={titleCase(r.matchOutcome)} /> },
      ] as unknown as ColumnDef<never>[],
      csvColumns: [
        { header: "Supplier", value: (r: SupplierAvailabilityRow) => r.supplierName },
        { header: "Product", value: (r: SupplierAvailabilityRow) => r.productTitle },
        { header: "Barcode", value: (r: SupplierAvailabilityRow) => r.barcode },
        { header: "Price", value: (r: SupplierAvailabilityRow) => r.price },
        { header: "Supplier Stock", value: (r: SupplierAvailabilityRow) => r.stockQty },
        { header: "MOQ", value: (r: SupplierAvailabilityRow) => r.moq },
        { header: "Lead Time (days)", value: (r: SupplierAvailabilityRow) => r.leadTimeDays },
        { header: "Last Updated", value: (r: SupplierAvailabilityRow) => r.lastUpdated },
        { header: "Opportunity", value: (r: SupplierAvailabilityRow) => r.matchOutcome },
      ] as unknown as { header: string; value: (r: never) => string | number | null | undefined }[],
    };
  },

  supplierComparison: (data) => {
    const d = data as { rows: SupplierComparisonRow[] };
    return {
      rows: d.rows,
      stats: [{ label: "Offers", value: formatNumber(d.rows.length) }],
      rowHref: (r: SupplierComparisonRow) => `/products/${r.productId}`,
      search: (r: SupplierComparisonRow) => `${r.title} ${r.primaryBarcode ?? ""} ${r.supplierName}`,
      columns: [
        { key: "product", header: "Product", render: (r: SupplierComparisonRow) => <div className="max-w-[200px] truncate">{r.title}</div>, sortValue: (r: SupplierComparisonRow) => r.title },
        { key: "brand", header: "Brand", render: (r: SupplierComparisonRow) => r.brand ?? "—" },
        { key: "supplier", header: "Supplier", render: (r: SupplierComparisonRow) => r.supplierName, sortValue: (r: SupplierComparisonRow) => r.supplierName },
        { key: "price", header: "Price", render: (r: SupplierComparisonRow) => formatMoney(r.price), sortValue: (r: SupplierComparisonRow) => r.price, align: "right" },
        { key: "cheapest", header: "Cheapest", render: (r: SupplierComparisonRow) => (r.isCheapest ? "Yes" : "—") },
        { key: "recommended", header: "Recommended", render: (r: SupplierComparisonRow) => (r.isRecommended ? <StatusBadge status="MATCHED_ALREADY_SELLING" label="Recommended" /> : "—") },
        { key: "profit", header: "Profit", render: (r: SupplierComparisonRow) => (r.profit != null ? formatMoney(r.profit) : "—"), sortValue: (r: SupplierComparisonRow) => r.profit ?? 0, align: "right" },
        { key: "roi", header: "ROI", render: (r: SupplierComparisonRow) => (r.roiPct != null ? formatPct(r.roiPct) : "—"), sortValue: (r: SupplierComparisonRow) => r.roiPct ?? 0, align: "right" },
        { key: "disq", header: "Disqualified", render: (r: SupplierComparisonRow) => (r.disqualifiedReasons.length > 0 ? r.disqualifiedReasons.join(", ") : "—") },
      ] as unknown as ColumnDef<never>[],
      csvColumns: [
        { header: "Product", value: (r: SupplierComparisonRow) => r.title },
        { header: "Brand", value: (r: SupplierComparisonRow) => r.brand },
        { header: "Barcode", value: (r: SupplierComparisonRow) => r.primaryBarcode },
        { header: "Supplier", value: (r: SupplierComparisonRow) => r.supplierName },
        { header: "Price", value: (r: SupplierComparisonRow) => r.price },
        { header: "Cheapest", value: (r: SupplierComparisonRow) => (r.isCheapest ? "Yes" : "No") },
        { header: "Recommended", value: (r: SupplierComparisonRow) => (r.isRecommended ? "Yes" : "No") },
        { header: "Profit", value: (r: SupplierComparisonRow) => r.profit },
        { header: "ROI %", value: (r: SupplierComparisonRow) => r.roiPct },
        { header: "Disqualified Reasons", value: (r: SupplierComparisonRow) => r.disqualifiedReasons.join("; ") },
      ] as unknown as { header: string; value: (r: never) => string | number | null | undefined }[],
    };
  },

  purchaseHistory: (data) => {
    const d = data as { rows: PurchaseHistoryRow[]; totalSpend: number; totalUnits: number; transactionCount: number };
    return {
      rows: d.rows,
      stats: [
        { label: "Total Spend", value: formatMoney(d.totalSpend) },
        { label: "Total Units", value: formatNumber(d.totalUnits) },
        { label: "Transactions", value: formatNumber(d.transactionCount) },
      ],
      rowHref: (r: PurchaseHistoryRow) => `/products/${r.productId}`,
      search: (r: PurchaseHistoryRow) => `${r.productTitle} ${r.productBarcode ?? ""} ${r.supplierName ?? ""}`,
      columns: [
        { key: "date", header: "Date", render: (r: PurchaseHistoryRow) => formatDate(r.date), sortValue: (r: PurchaseHistoryRow) => r.date },
        { key: "invoice", header: "Invoice", render: (r: PurchaseHistoryRow) => r.invoiceId ?? "—" },
        { key: "supplier", header: "Supplier", render: (r: PurchaseHistoryRow) => r.supplierName ?? "—" },
        { key: "product", header: "Product", render: (r: PurchaseHistoryRow) => <div className="max-w-[200px] truncate">{r.productTitle}</div> },
        { key: "qty", header: "Qty", render: (r: PurchaseHistoryRow) => formatNumber(r.qty), sortValue: (r: PurchaseHistoryRow) => r.qty, align: "right" },
        { key: "cost", header: "New Cost", render: (r: PurchaseHistoryRow) => formatMoney(r.newCost), sortValue: (r: PurchaseHistoryRow) => r.newCost, align: "right" },
        { key: "prevCost", header: "Previous Cost", render: (r: PurchaseHistoryRow) => (r.previousCost != null ? formatMoney(r.previousCost) : "—"), align: "right" },
        { key: "total", header: "Line Total", render: (r: PurchaseHistoryRow) => formatMoney(r.lineTotal), sortValue: (r: PurchaseHistoryRow) => r.lineTotal, align: "right" },
      ] as unknown as ColumnDef<never>[],
      csvColumns: [
        { header: "Date", value: (r: PurchaseHistoryRow) => r.date },
        { header: "Invoice", value: (r: PurchaseHistoryRow) => r.invoiceId },
        { header: "Supplier", value: (r: PurchaseHistoryRow) => r.supplierName },
        { header: "Product", value: (r: PurchaseHistoryRow) => r.productTitle },
        { header: "Barcode", value: (r: PurchaseHistoryRow) => r.productBarcode },
        { header: "Qty", value: (r: PurchaseHistoryRow) => r.qty },
        { header: "New Cost", value: (r: PurchaseHistoryRow) => r.newCost },
        { header: "Previous Cost", value: (r: PurchaseHistoryRow) => r.previousCost },
        { header: "Line Total", value: (r: PurchaseHistoryRow) => r.lineTotal },
      ] as unknown as { header: string; value: (r: never) => string | number | null | undefined }[],
    };
  },

  stockMovement: (data) => {
    const d = data as { rows: StockMovementRow[]; totalIn: number; totalOut: number; transactionCount: number };
    return {
      rows: d.rows,
      stats: [
        { label: "Units In", value: formatNumber(d.totalIn) },
        { label: "Units Out", value: formatNumber(d.totalOut) },
        { label: "Transactions", value: formatNumber(d.transactionCount) },
      ],
      rowHref: (r: StockMovementRow) => `/products/${r.productId}`,
      search: (r: StockMovementRow) => `${r.productTitle} ${r.productBarcode ?? ""} ${r.supplierName ?? ""}`,
      columns: [
        { key: "date", header: "Date", render: (r: StockMovementRow) => formatDate(r.date), sortValue: (r: StockMovementRow) => r.date },
        { key: "product", header: "Product", render: (r: StockMovementRow) => <div className="max-w-[200px] truncate">{r.productTitle}</div> },
        { key: "location", header: "Location", render: (r: StockMovementRow) => r.locationName },
        { key: "source", header: "Source", render: (r: StockMovementRow) => titleCase(r.sourceType) },
        { key: "qty", header: "Qty", render: (r: StockMovementRow) => formatNumber(r.qty), sortValue: (r: StockMovementRow) => r.qty, align: "right" },
        { key: "cost", header: "Cost", render: (r: StockMovementRow) => (r.newCostPrice != null ? formatMoney(r.newCostPrice) : "—"), align: "right" },
        { key: "ref", header: "Reference", render: (r: StockMovementRow) => r.invoiceId ?? r.shipmentReference ?? "—" },
      ] as unknown as ColumnDef<never>[],
      csvColumns: [
        { header: "Date", value: (r: StockMovementRow) => r.date },
        { header: "Product", value: (r: StockMovementRow) => r.productTitle },
        { header: "Barcode", value: (r: StockMovementRow) => r.productBarcode },
        { header: "Location", value: (r: StockMovementRow) => r.locationName },
        { header: "Source", value: (r: StockMovementRow) => r.sourceType },
        { header: "Qty", value: (r: StockMovementRow) => r.qty },
        { header: "Cost", value: (r: StockMovementRow) => r.newCostPrice },
        { header: "Supplier", value: (r: StockMovementRow) => r.supplierName },
        { header: "Reference", value: (r: StockMovementRow) => r.invoiceId ?? r.shipmentReference },
      ] as unknown as { header: string; value: (r: never) => string | number | null | undefined }[],
    };
  },
};

export function ReportsView({ catalog, initialKey, initialData }: { catalog: Catalog; initialKey: string; initialData: unknown }) {
  const [selectedKey, setSelectedKey] = useState(initialKey);
  const [cache, setCache] = useState<Record<string, unknown>>({ [initialKey]: initialData });
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function selectReport(key: string) {
    setSelectedKey(key);
    setError(null);
    if (cache[key] !== undefined) return;
    setLoading(key);
    startTransition(async () => {
      const result = await loadReportAction(key);
      setLoading(null);
      if (result.error) setError(result.error);
      else setCache((prev) => ({ ...prev, [key]: result.data }));
    });
  }

  const entry: ReportCatalogEntry | undefined = catalog.flatMap((c) => c.reports).find((r) => r.key === selectedKey);
  const data = cache[selectedKey];
  const rendered = entry && data !== undefined ? RENDERERS[entry.shape]?.(data) : null;

  return (
    <div className="flex gap-4">
      <div className="flex w-56 shrink-0 flex-col gap-4">
        {catalog.map((cat) => (
          <div key={cat.label} className="flex flex-col gap-0.5">
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{cat.label}</div>
            {cat.reports.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => selectReport(r.key)}
                className={`rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                  selectedKey === r.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {entry && <p className="text-sm text-slate-500">{entry.description}</p>}

        {loading === selectedKey && <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-400">Loading report...</div>}
        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        {rendered && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-3">
                {rendered.stats.map((s) => (
                  <Stat key={s.label} label={s.label} value={s.value} />
                ))}
              </div>
              <ExportCsvButton rows={rendered.rows as never[]} columns={rendered.csvColumns} filename={`${selectedKey}.csv`} />
            </div>
            <DataTable
              columns={rendered.columns}
              rows={rendered.rows as never[]}
              rowKey={(r: never) => {
                const row = r as { id?: string; supplierId?: string; productId?: string; brand?: string; invoiceId?: string };
                if (row.id) return row.id;
                if (row.supplierId || row.productId) return `${row.supplierId ?? ""}-${row.productId ?? ""}`;
                if (row.brand) return row.brand;
                return JSON.stringify(row).slice(0, 64);
              }}
              rowHref={rendered.rowHref}
              searchPlaceholder="Search..."
              searchFields={rendered.search}
              emptyMessage="No rows for this report."
            />
          </>
        )}
      </div>
    </div>
  );
}
