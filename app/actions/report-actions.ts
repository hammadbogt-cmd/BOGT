"use server";

import { requirePermission } from "../../lib/auth/current-user";
import { toPlain } from "../../lib/serialize";
import {
  getInventoryValuationReport,
  getProfitabilityReport,
  getReorderNeedsReport,
  getSupplierSpendReport,
  getAmazonInventoryReport,
  getRoverInventoryReport,
  getOfficeInventoryReport,
  getTotalInventoryReport,
  getInventoryByBrandReport,
  getOosReport,
  getNearOosReport,
  getBsrPriorityReorderReport,
  getFastMovingReport,
  getSlowMovingReport,
  getNoSaleReport,
  getOverstockReport,
  getLossMakingReport,
  getLowRoiReport,
  getPurchasePriceChangesReport,
  getInvoiceDiscrepanciesReport,
  getSupplierAvailabilityReport,
} from "../../lib/queries/reports";
import { getSupplierComparisonRows } from "../../lib/queries/supplier-comparison";
import { getPurchaseHistory } from "../../lib/queries/purchase-history";
import { getStockMovements } from "../../lib/queries/stock-movements";

export interface ReportLoadState {
  key?: string;
  data?: unknown;
  error?: string;
}

/**
 * Loads one report's data on demand (spec section 36's full report catalog —
 * see lib/reports-catalog.ts). Reports are fetched lazily rather than all at
 * once on page load: with ~3,000+ products, eagerly loading all ~25 reports
 * would mean fetching and serializing tens of thousands of rows the user
 * never looks at in a given visit.
 */
export async function loadReportAction(key: string): Promise<ReportLoadState> {
  try {
    await requirePermission("export_reports");

    switch (key) {
      case "valuation":
        return { key, data: toPlain(await getInventoryValuationReport()) };
      case "profitability":
        return { key, data: toPlain(await getProfitabilityReport()) };
      case "reorder":
        return { key, data: toPlain(await getReorderNeedsReport()) };
      case "supplier_spend":
        return { key, data: toPlain(await getSupplierSpendReport()) };
      case "amazon_inventory":
        return { key, data: toPlain(await getAmazonInventoryReport()) };
      case "rover_inventory":
        return { key, data: toPlain(await getRoverInventoryReport()) };
      case "office_inventory":
        return { key, data: toPlain(await getOfficeInventoryReport()) };
      case "total_inventory":
        return { key, data: toPlain(await getTotalInventoryReport()) };
      case "by_brand":
        return { key, data: toPlain(await getInventoryByBrandReport()) };
      case "oos":
        return { key, data: toPlain(await getOosReport()) };
      case "near_oos":
        return { key, data: toPlain(await getNearOosReport()) };
      case "bsr_priority_reorders":
        return { key, data: toPlain(await getBsrPriorityReorderReport()) };
      case "fast_moving":
        return { key, data: toPlain(await getFastMovingReport()) };
      case "slow_moving":
        return { key, data: toPlain(await getSlowMovingReport()) };
      case "no_sale":
        return { key, data: toPlain(await getNoSaleReport()) };
      case "overstock":
        return { key, data: toPlain(await getOverstockReport()) };
      case "loss_making":
        return { key, data: toPlain(await getLossMakingReport()) };
      case "low_roi":
        return { key, data: toPlain(await getLowRoiReport()) };
      case "price_changes":
        return { key, data: toPlain(await getPurchasePriceChangesReport()) };
      case "invoice_discrepancies":
        return { key, data: toPlain(await getInvoiceDiscrepanciesReport()) };
      case "supplier_availability":
        return { key, data: toPlain(await getSupplierAvailabilityReport()) };
      case "supplier_comparison":
        return { key, data: toPlain({ rows: await getSupplierComparisonRows({}) }) };
      case "purchase_history":
        return { key, data: toPlain(await getPurchaseHistory({})) };
      case "stock_in":
        return { key, data: toPlain(await getStockMovements({ direction: "IN" })) };
      case "stock_out":
        return { key, data: toPlain(await getStockMovements({ direction: "OUT" })) };
      default:
        return { error: `Unknown report: ${key}` };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
