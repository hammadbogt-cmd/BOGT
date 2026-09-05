import type { BusinessSettings } from "./calc/settings";

export type SettingFieldType = "percent" | "money" | "number" | "int" | "bool" | "coverage_days";

export interface SettingFieldDef {
  key: keyof BusinessSettings;
  label: string;
  type: SettingFieldType;
  hint?: string;
  group: string;
}

/**
 * Single source of truth for the Settings page (spec section 34): both the
 * form renderer and the Server Action's FormData parser walk this same list,
 * so a field can never drift out of sync between what's shown and what's
 * saved. "percent" fields are stored as fractions (0.05) but shown/edited as
 * whole percentages (5) to match how a human reads them.
 */
export const SETTING_FIELDS: SettingFieldDef[] = [
  // VAT & Fees
  { key: "purchaseVatPct", label: "Purchase VAT", type: "percent", group: "VAT & Fees" },
  { key: "defaultFbaFee", label: "Default FBA Fee (AED)", type: "money", group: "VAT & Fees", hint: "Used when a product has no source-provided FBA fee" },

  // Referral fee tiers
  { key: "referralFeeLowPct", label: "Referral Fee — Below Threshold", type: "percent", group: "Referral Fee Tiers" },
  { key: "referralFeeHighPct", label: "Referral Fee — Above Threshold", type: "percent", group: "Referral Fee Tiers" },
  { key: "referralThresholdPrice", label: "Referral Threshold Price (AED)", type: "money", group: "Referral Fee Tiers" },

  // Profitability thresholds
  { key: "highProfitMarginPct", label: "High Profit Margin ≥", type: "percent", group: "Profitability Thresholds" },
  { key: "lowProfitMarginPct", label: "Profitable Margin ≥ (below this is Low Profit)", type: "percent", group: "Profitability Thresholds" },
  { key: "breakEvenBandPct", label: "Break-Even Band (± around zero)", type: "percent", group: "Profitability Thresholds" },
  { key: "minRoiPct", label: "Minimum ROI to Reorder", type: "percent", group: "Profitability Thresholds" },

  // BSR-tiered reorder rule
  { key: "priorityBsrThreshold", label: "Priority BSR Threshold (BSR ≤ this = priority tier)", type: "int", group: "BSR Reorder Rules" },
  { key: "priorityMinTargetQty", label: "Priority Tier Floor Target (30-day)", type: "int", group: "BSR Reorder Rules" },
  { key: "priorityDemandMultiplier", label: "Priority Tier Demand Multiplier", type: "number", group: "BSR Reorder Rules", hint: "1.0 = 100% of actual sales" },
  { key: "standardDemandMultiplier", label: "Standard Tier Demand Multiplier", type: "number", group: "BSR Reorder Rules", hint: "1.0 = 100% of actual sales" },
  { key: "standardRoundingIncrement", label: "Standard Tier Rounding Increment", type: "int", group: "BSR Reorder Rules" },
  { key: "reorderRounding", label: "Final Recommended Qty Rounding", type: "int", group: "BSR Reorder Rules" },

  // Safety stock / lead time
  { key: "safetyStockDefault", label: "Default Safety Stock (units)", type: "int", group: "Safety Stock & Lead Time" },
  { key: "leadTimeDaysDefault", label: "Default Lead Time (days)", type: "int", group: "Safety Stock & Lead Time" },

  // Stock status thresholds
  { key: "criticalStockDaysMax", label: "Critical: Days of Stock ≤", type: "int", group: "Stock Status Thresholds" },
  { key: "nearOosDaysMax", label: "Near-OOS: Days of Stock ≤", type: "int", group: "Stock Status Thresholds" },
  { key: "lowStockDaysMax", label: "Low Stock: Days of Stock ≤", type: "int", group: "Stock Status Thresholds" },

  // Availability
  { key: "includeOfficeStockInAvailability", label: "Include Office Stock in Reorder Availability", type: "bool", group: "Availability" },

  // General
  { key: "highSalesThreshold", label: "Fast-Moving Threshold (T30 units)", type: "int", group: "General Thresholds" },
  { key: "overstockDaysThreshold", label: "Overstock Threshold (days of stock)", type: "int", group: "General Thresholds" },
  { key: "invoicePriceIncreaseWarningPct", label: "Invoice Price Increase Warning ≥", type: "percent", group: "General Thresholds" },
  { key: "largePriceIncreasePct", label: "Large Price Increase ≥", type: "percent", group: "General Thresholds" },
  { key: "defaultCoverageDays", label: "Default Reorder Coverage Window", type: "coverage_days", group: "General Thresholds" },
  { key: "supplierPriorityWeight", label: "Default Supplier Priority Weight", type: "int", group: "General Thresholds", hint: "Lower number wins tie-breaks between equally-priced suppliers" },
];

export function fieldFormValue(settings: BusinessSettings, field: SettingFieldDef): string {
  const raw = settings[field.key];
  if (field.type === "percent") return (Number(raw) * 100).toString();
  if (field.type === "bool") return raw ? "true" : "false";
  return String(raw);
}

export function parseFieldValue(field: SettingFieldDef, raw: string): number | boolean {
  if (field.type === "bool") return raw === "true" || raw === "on";
  if (field.type === "percent") return Number(raw) / 100;
  if (field.type === "coverage_days") return raw === "60" ? 60 : 30;
  if (field.type === "int") return Math.round(Number(raw));
  return Number(raw);
}
