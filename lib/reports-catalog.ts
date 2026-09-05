/**
 * The full section-36 report catalog. Every report the spec names lives here
 * as one entry; `shape` says which generic table/column-set + CSV export
 * renders it (see app/(app)/reports/ReportsView.tsx) so most reports need no
 * bespoke UI code — only a query function (lib/queries/reports.ts and the
 * existing purchase-history/stock-movements/supplier-comparison query
 * modules) and a catalog entry.
 */
export type ReportShape =
  | "valuation"
  | "profitability"
  | "reorder"
  | "supplierSpend"
  | "location"
  | "totalInventory"
  | "brand"
  | "stockStatus"
  | "profitFilter"
  | "priceChanges"
  | "invoiceDiscrepancies"
  | "supplierAvailability"
  | "supplierComparison"
  | "purchaseHistory"
  | "stockMovement";

export interface ReportCatalogEntry {
  key: string;
  label: string;
  shape: ReportShape;
  description: string;
}

export interface ReportCategory {
  label: string;
  reports: ReportCatalogEntry[];
}

export const REPORT_CATALOG: ReportCategory[] = [
  {
    label: "Inventory",
    reports: [
      { key: "amazon_inventory", label: "Amazon Inventory", shape: "location", description: "Every product's Amazon-available quantity and value." },
      { key: "rover_inventory", label: "Rover Inventory", shape: "location", description: "Every product's Rover warehouse quantity and value." },
      { key: "office_inventory", label: "Office Inventory", shape: "location", description: "Every product's office quantity and value." },
      { key: "total_inventory", label: "Total Inventory", shape: "totalInventory", description: "All locations side by side, one row per product." },
      { key: "valuation", label: "Inventory Value", shape: "valuation", description: "Total AED value tied up in stock, by product." },
      { key: "by_brand", label: "Inventory by Brand", shape: "brand", description: "Units and value rolled up by brand." },
    ],
  },
  {
    label: "Sales & Stock Status",
    reports: [
      { key: "oos", label: "OOS", shape: "stockStatus", description: "Products with zero net available stock." },
      { key: "near_oos", label: "Near OOS", shape: "stockStatus", description: "Products approaching stock-out." },
      { key: "bsr_priority_reorders", label: "BSR <= 5,000 Reorders", shape: "stockStatus", description: "Priority-tier products that still need buying." },
      { key: "fast_moving", label: "Fast-Moving Items", shape: "stockStatus", description: "T30 sales at or above the fast-moving threshold." },
      { key: "slow_moving", label: "Slow-Moving Items", shape: "stockStatus", description: "Some sales, but well below the fast-moving threshold." },
      { key: "no_sale", label: "No-Sale Items", shape: "stockStatus", description: "Zero units shipped in the last 30 days." },
      { key: "overstock", label: "Overstock", shape: "stockStatus", description: "Days of stock beyond the overstock threshold." },
      { key: "reorder", label: "Reorder Recommendations", shape: "reorder", description: "Every product with a positive recommended purchase qty." },
    ],
  },
  {
    label: "Profitability",
    reports: [
      { key: "profitability", label: "Profitability", shape: "profitability", description: "Profit, margin and ROI at current cost, every product." },
      { key: "loss_making", label: "Loss-Making Products", shape: "profitFilter", description: "Products currently selling at a loss." },
      { key: "low_roi", label: "Low ROI Products", shape: "profitFilter", description: "Products below the configured minimum ROI (not already a loss)." },
    ],
  },
  {
    label: "Supplier & Purchasing",
    reports: [
      { key: "supplier_comparison", label: "Supplier Comparison", shape: "supplierComparison", description: "Every supplier's price for each product, side by side." },
      { key: "supplier_availability", label: "Supplier Availability", shape: "supplierAvailability", description: "Every active supplier offer, classified by opportunity." },
      { key: "supplier_spend", label: "Supplier Spend", shape: "supplierSpend", description: "Total historical spend per supplier." },
      { key: "price_changes", label: "Purchase Price Changes", shape: "priceChanges", description: "Every recorded supplier price increase or decrease." },
      { key: "invoice_discrepancies", label: "Invoice Discrepancies", shape: "invoiceDiscrepancies", description: "Invoice lines that weren't a clean price match." },
      { key: "purchase_history", label: "Purchase History", shape: "purchaseHistory", description: "Every Stock IN purchase transaction, chronologically." },
      { key: "stock_in", label: "Stock IN", shape: "stockMovement", description: "Every incoming inventory transaction." },
      { key: "stock_out", label: "Stock OUT", shape: "stockMovement", description: "Every outgoing inventory transaction." },
    ],
  },
];

export function findReportEntry(key: string): ReportCatalogEntry | undefined {
  for (const cat of REPORT_CATALOG) {
    const found = cat.reports.find((r) => r.key === key);
    if (found) return found;
  }
  return undefined;
}
