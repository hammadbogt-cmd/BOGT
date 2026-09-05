/**
 * Business-rule settings that drive every calculation in the app.
 *
 * IMPORTANT: nothing in the reorder/profitability/stock-status engines is
 * hardcoded. Every threshold below is read from the `Setting` table at
 * runtime (see lib/settings-store.ts) and falls back to these defaults only
 * when a key has never been set. Changing a value in the Settings UI takes
 * effect on the next calculation without a code change or deploy.
 */

export interface BusinessSettings {
  /** Purchase VAT applied to supplier cost, e.g. 0.05 = 5% */
  purchaseVatPct: number;

  /** Default FBA fee (AED) used when a product has no source-provided FBA fee */
  defaultFbaFee: number;

  /** Referral fee tiers, evaluated against the selling price */
  referralFeeLowPct: number; // applies when sellingPrice <= referralThreshold
  referralFeeHighPct: number; // applies when sellingPrice > referralThreshold
  referralThresholdPrice: number;

  /** Profitability status thresholds, evaluated on margin % (profit / sellingPrice) */
  highProfitMarginPct: number; // >= this => HIGH_PROFIT
  lowProfitMarginPct: number; // >= this and < highProfit => PROFITABLE; below this => LOW_PROFIT
  breakEvenBandPct: number; // |margin| <= this => BREAK_EVEN (around zero)
  minRoiPct: number; // used by "Not Profitable to Reorder" / ROI alerts

  /** BSR-tiered reorder demand rule */
  priorityBsrThreshold: number; // BSR <= this => "priority" tier
  priorityMinTargetQty: number; // floor target for a 30-day window in the priority tier
  priorityDemandMultiplier: number; // multiplier applied to actual sales before flooring
  standardDemandMultiplier: number; // multiplier applied to actual sales in the standard (BSR > threshold) tier
  standardRoundingIncrement: number; // round *up* to the nearest multiple of this, standard tier only

  /** Safety stock & lead time (can later be overridden per-product) */
  safetyStockDefault: number;
  leadTimeDaysDefault: number;

  /** Days-of-stock status thresholds (inclusive upper bounds, in days) */
  criticalStockDaysMax: number; // 1..this => CRITICAL (0 handled separately as OOS)
  nearOosDaysMax: number; // (criticalMax, this] => NEAR_OOS
  lowStockDaysMax: number; // (nearOosMax, this] => LOW_STOCK; beyond => HEALTHY

  /** General thresholds used across dashboards/alerts */
  highSalesThreshold: number; // units T30 considered "fast-moving"
  overstockDaysThreshold: number; // days of stock beyond which a product is "overstock"
  invoicePriceIncreaseWarningPct: number; // e.g. 0.05 = 5%
  largePriceIncreasePct: number; // e.g. 0.15 = 15%

  /** Whether office stock counts toward reorder net-availability */
  includeOfficeStockInAvailability: boolean;

  /** Rounding applied to final recommended-qty output ("nearest 1/5/10") */
  reorderRounding: number;

  /** Default coverage window shown by default in the Reorder Center */
  defaultCoverageDays: 30 | 60;

  /** Supplier tie-break priority: lower number = more preferred when price ties */
  supplierPriorityWeight: number;
}

export const DEFAULT_SETTINGS: BusinessSettings = {
  purchaseVatPct: 0.05,
  defaultFbaFee: 9,

  referralFeeLowPct: 0.08,
  referralFeeHighPct: 0.1,
  referralThresholdPrice: 50,

  highProfitMarginPct: 0.25,
  lowProfitMarginPct: 0.1,
  breakEvenBandPct: 0.02,
  minRoiPct: 0.15,

  priorityBsrThreshold: 5000,
  priorityMinTargetQty: 50,
  priorityDemandMultiplier: 1.0,
  standardDemandMultiplier: 1.0,
  standardRoundingIncrement: 10,

  safetyStockDefault: 0,
  leadTimeDaysDefault: 14,

  criticalStockDaysMax: 7,
  nearOosDaysMax: 15,
  lowStockDaysMax: 30,

  highSalesThreshold: 30,
  overstockDaysThreshold: 120,
  invoicePriceIncreaseWarningPct: 0.05,
  largePriceIncreasePct: 0.15,

  includeOfficeStockInAvailability: true,
  reorderRounding: 1,
  defaultCoverageDays: 30,
  supplierPriorityWeight: 100,
};

/** Setting keys as stored in the `Setting` table (one JSON row per key, grouped). */
export const SETTINGS_KEY = "business_rules" as const;
