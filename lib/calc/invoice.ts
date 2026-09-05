import { BusinessSettings } from "./settings";
import { calculateProfit } from "./profitability";

export type InvoiceLineStatus =
  | "PRICE_OK"
  | "PRICE_DECREASED"
  | "PRICE_INCREASED"
  | "LARGE_PRICE_INCREASE"
  | "LOW_PROFIT"
  | "LOSS"
  | "BETTER_SUPPLIER_AVAILABLE"
  | "QTY_DIFFERENCE"
  | "UNKNOWN_PRODUCT"
  | "BARCODE_NOT_MATCHED"
  | "REVIEW_REQUIRED";

export interface InvoiceLineInput {
  matched: boolean;
  matchedByBarcode: boolean;
  invoicePrice: number;
  invoiceQty: number;
  expectedQty?: number | null;

  /** Reference prices, priority order per spec section 25 */
  lastPurchasePrice?: number | null;
  currentMasterCost?: number | null;
  weightedAvgPrice?: number | null;
  lowestHistoricalPrice?: number | null;

  bestCurrentSupplierPrice?: number | null;
  currentSellingPrice?: number | null;
  fbaFee?: number | null;
}

export interface InvoiceLineResult {
  statuses: InvoiceLineStatus[];
  primaryStatus: InvoiceLineStatus;
  referencePriceUsed: number | null;
  referencePriceSource: string | null;
  priceDiff: number | null;
  priceDiffPct: number | null;
  profit: number | null;
  roiPct: number | null;
}

/**
 * Picks the comparison price using the priority spec section 25 requires:
 * last actual purchase price first, then current master cost, then weighted
 * average, then lowest historical. Never compares against a stale/irrelevant
 * "old cost" column alone.
 */
function pickReferencePrice(input: InvoiceLineInput): { price: number | null; source: string | null } {
  if (input.lastPurchasePrice != null) return { price: input.lastPurchasePrice, source: "LAST_PURCHASE_PRICE" };
  if (input.currentMasterCost != null) return { price: input.currentMasterCost, source: "CURRENT_MASTER_COST" };
  if (input.weightedAvgPrice != null) return { price: input.weightedAvgPrice, source: "WEIGHTED_AVERAGE_COST" };
  if (input.lowestHistoricalPrice != null) return { price: input.lowestHistoricalPrice, source: "LOWEST_HISTORICAL_COST" };
  return { price: null, source: null };
}

export function classifyInvoiceLine(input: InvoiceLineInput, settings: BusinessSettings): InvoiceLineResult {
  const statuses: InvoiceLineStatus[] = [];

  if (!input.matched) {
    const unmatchedStatus: InvoiceLineStatus = input.matchedByBarcode === false ? "BARCODE_NOT_MATCHED" : "UNKNOWN_PRODUCT";
    return {
      statuses: [unmatchedStatus],
      primaryStatus: unmatchedStatus,
      referencePriceUsed: null,
      referencePriceSource: null,
      priceDiff: null,
      priceDiffPct: null,
      profit: null,
      roiPct: null,
    };
  }

  const { price: refPrice, source: refSource } = pickReferencePrice(input);
  let priceDiff: number | null = null;
  let priceDiffPct: number | null = null;

  if (refPrice != null && refPrice !== 0) {
    priceDiff = input.invoicePrice - refPrice;
    priceDiffPct = priceDiff / refPrice;

    if (priceDiffPct >= settings.largePriceIncreasePct) {
      statuses.push("LARGE_PRICE_INCREASE");
    } else if (priceDiffPct >= settings.invoicePriceIncreaseWarningPct) {
      statuses.push("PRICE_INCREASED");
    } else if (priceDiffPct < 0) {
      statuses.push("PRICE_DECREASED");
    } else {
      statuses.push("PRICE_OK");
    }
  } else {
    statuses.push("REVIEW_REQUIRED");
  }

  if (input.expectedQty != null && input.expectedQty !== input.invoiceQty) {
    statuses.push("QTY_DIFFERENCE");
  }

  let profit: number | null = null;
  let roiPct: number | null = null;
  if (input.currentSellingPrice != null) {
    const p = calculateProfit(
      { sellingPrice: input.currentSellingPrice, purchaseCost: input.invoicePrice, fbaFee: input.fbaFee },
      settings
    );
    profit = p.profit;
    roiPct = p.roiPct;
    if (p.profit <= 0) {
      statuses.push("LOSS");
    } else if (p.marginPct / 100 < settings.lowProfitMarginPct) {
      statuses.push("LOW_PROFIT");
    }
  }

  if (input.bestCurrentSupplierPrice != null && input.bestCurrentSupplierPrice < input.invoicePrice) {
    statuses.push("BETTER_SUPPLIER_AVAILABLE");
  }

  if (statuses.length === 0) statuses.push("REVIEW_REQUIRED");

  // Severity ranking decides which single status headlines the row in list views.
  const severityOrder: InvoiceLineStatus[] = [
    "BARCODE_NOT_MATCHED",
    "UNKNOWN_PRODUCT",
    "LOSS",
    "LARGE_PRICE_INCREASE",
    "BETTER_SUPPLIER_AVAILABLE",
    "PRICE_INCREASED",
    "LOW_PROFIT",
    "QTY_DIFFERENCE",
    "REVIEW_REQUIRED",
    "PRICE_DECREASED",
    "PRICE_OK",
  ];
  const primaryStatus = severityOrder.find((s) => statuses.includes(s)) ?? statuses[0];

  return {
    statuses,
    primaryStatus,
    referencePriceUsed: refPrice,
    referencePriceSource: refSource,
    priceDiff,
    priceDiffPct,
    profit,
    roiPct,
  };
}
