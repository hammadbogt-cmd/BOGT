import { BusinessSettings } from "./settings";

export type ProfitStatus =
  | "HIGH_PROFIT"
  | "PROFITABLE"
  | "LOW_PROFIT"
  | "BREAK_EVEN"
  | "LOSS";

export interface ProfitInput {
  sellingPrice: number;
  purchaseCost: number; // cost BEFORE vat
  /** Product-specific FBA fee from the source sheet, if known. Falls back to settings.defaultFbaFee. */
  fbaFee?: number | null;
}

export interface ProfitResult {
  costWithVat: number;
  referralFeePct: number;
  referralFee: number;
  fbaFee: number;
  totalCost: number;
  profit: number;
  roiPct: number; // profit / costWithVat * 100
  marginPct: number; // profit / sellingPrice * 100
  status: ProfitStatus;
}

/** Referral fee percentage applicable at a given selling price, per configured tiers. */
export function referralFeePct(sellingPrice: number, settings: BusinessSettings): number {
  return sellingPrice <= settings.referralThresholdPrice
    ? settings.referralFeeLowPct
    : settings.referralFeeHighPct;
}

/**
 * Core profitability formula (spec section 12):
 *   CostWithVat = Cost * (1 + VAT%)
 *   ReferralFee = SellingPrice * applicableReferral%
 *   TotalCost   = CostWithVat + FBAFee + ReferralFee
 *   Profit      = SellingPrice - TotalCost
 *   ROI         = Profit / CostWithVat * 100
 *   Margin      = Profit / SellingPrice * 100
 */
export function calculateProfit(input: ProfitInput, settings: BusinessSettings): ProfitResult {
  const costWithVat = input.purchaseCost * (1 + settings.purchaseVatPct);
  const fbaFee = input.fbaFee ?? settings.defaultFbaFee;
  const pct = referralFeePct(input.sellingPrice, settings);
  const referralFee = input.sellingPrice * pct;
  const totalCost = costWithVat + fbaFee + referralFee;
  const profit = input.sellingPrice - totalCost;
  const roiPct = costWithVat !== 0 ? (profit / costWithVat) * 100 : 0;
  const marginPct = input.sellingPrice !== 0 ? (profit / input.sellingPrice) * 100 : 0;

  return {
    costWithVat,
    referralFeePct: pct,
    referralFee,
    fbaFee,
    totalCost,
    profit,
    roiPct,
    marginPct,
    status: classifyProfitStatus(marginPct, settings),
  };
}

export function classifyProfitStatus(marginPct: number, settings: BusinessSettings): ProfitStatus {
  const marginFraction = marginPct / 100;
  if (Math.abs(marginFraction) <= settings.breakEvenBandPct) return "BREAK_EVEN";
  if (marginFraction < 0) return "LOSS";
  if (marginFraction >= settings.highProfitMarginPct) return "HIGH_PROFIT";
  if (marginFraction >= settings.lowProfitMarginPct) return "PROFITABLE";
  return "LOW_PROFIT";
}

/**
 * True mathematical breakeven selling price, correctly accounting for the
 * referral fee being a PERCENTAGE OF SELLING PRICE (not of cost), and for the
 * referral rate itself depending on which price tier the breakeven falls
 * into. Spec section 12: "Calculate true selling-price breakeven
 * mathematically" — do not add a cost-based referral fee to cost.
 *
 * Profit = SP - CostWithVat - FBA - SP * referralPct = 0
 * SP * (1 - referralPct) = CostWithVat + FBA
 * SP = (CostWithVat + FBA) / (1 - referralPct)
 */
export function calculateBreakevenPrice(
  purchaseCost: number,
  settings: BusinessSettings,
  fbaFee?: number | null
): number {
  const costWithVat = purchaseCost * (1 + settings.purchaseVatPct);
  const fba = fbaFee ?? settings.defaultFbaFee;

  // Try the low tier first.
  const lowRate = settings.referralFeeLowPct;
  const spLow = (costWithVat + fba) / (1 - lowRate);
  if (spLow <= settings.referralThresholdPrice) {
    return spLow;
  }

  // Breakeven falls above the threshold: recompute using the high tier's rate,
  // since that is the rate that will actually apply at that price point.
  const highRate = settings.referralFeeHighPct;
  return (costWithVat + fba) / (1 - highRate);
}

/** Profit/ROI at a hypothetical supplier cost, for supplier-comparison screens. */
export function profitAtSupplierPrice(
  sellingPrice: number,
  supplierCost: number,
  settings: BusinessSettings,
  fbaFee?: number | null
): ProfitResult {
  return calculateProfit({ sellingPrice, purchaseCost: supplierCost, fbaFee }, settings);
}
