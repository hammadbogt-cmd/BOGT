import { BusinessSettings } from "./settings";
import { calculateProfit } from "./profitability";

export interface SupplierOffer {
  supplierId: string;
  supplierName: string;
  price: number;
  stockQty: number | null;
  moq: number | null;
  leadTimeDays: number | null;
  priorityWeight: number; // lower = more preferred on ties
}

export interface EvaluatedOffer extends SupplierOffer {
  profit: number;
  roiPct: number;
  marginPct: number;
  isProfitable: boolean;
  meetsQtyNeeded: boolean;
  meetsMoq: boolean;
  disqualifiedReasons: string[];
}

export function evaluateOffers(
  offers: SupplierOffer[],
  sellingPrice: number,
  qtyNeeded: number,
  settings: BusinessSettings,
  fbaFee?: number | null
): EvaluatedOffer[] {
  return offers.map((offer) => {
    const p = calculateProfit({ sellingPrice, purchaseCost: offer.price, fbaFee }, settings);
    const meetsQtyNeeded = offer.stockQty == null || offer.stockQty >= qtyNeeded;
    const meetsMoq = offer.moq == null || qtyNeeded >= offer.moq || offer.stockQty != null;
    const reasons: string[] = [];
    if (!meetsQtyNeeded) reasons.push("INSUFFICIENT_STOCK");
    if (p.roiPct / 100 < settings.minRoiPct) reasons.push("BELOW_MIN_ROI");
    if (p.profit <= 0) reasons.push("LOSS_MAKING");

    return {
      ...offer,
      profit: p.profit,
      roiPct: p.roiPct,
      marginPct: p.marginPct,
      isProfitable: p.profit > 0,
      meetsQtyNeeded,
      meetsMoq,
      disqualifiedReasons: reasons,
    };
  });
}

/**
 * The cheapest supplier is not automatically the recommended one (spec
 * section 19): no stock, bad MOQ, long lead time, or a loss-making price all
 * disqualify a supplier from being the RECOMMENDED choice, even though it's
 * still shown in the comparison table.
 *
 * Selection order among qualifying offers: lowest price, then shortest lead
 * time, then lowest (better) supplier priority weight.
 */
export function pickBestSupplier(
  offers: SupplierOffer[],
  sellingPrice: number,
  qtyNeeded: number,
  settings: BusinessSettings,
  fbaFee?: number | null
): { best: EvaluatedOffer | null; evaluated: EvaluatedOffer[] } {
  const evaluated = evaluateOffers(offers, sellingPrice, qtyNeeded, settings, fbaFee);

  const qualifying = evaluated.filter((o) => o.disqualifiedReasons.length === 0);

  const pool = qualifying.length > 0 ? qualifying : evaluated.filter((o) => o.isProfitable);

  if (pool.length === 0) {
    return { best: null, evaluated };
  }

  const sorted = [...pool].sort((a, b) => {
    if (a.price !== b.price) return a.price - b.price;
    const leadA = a.leadTimeDays ?? Number.MAX_SAFE_INTEGER;
    const leadB = b.leadTimeDays ?? Number.MAX_SAFE_INTEGER;
    if (leadA !== leadB) return leadA - leadB;
    return a.priorityWeight - b.priorityWeight;
  });

  return { best: sorted[0], evaluated };
}

/** Supplier-upload matching outcome labels (spec section 18). */
export type SupplierMatchOutcome =
  | "MATCHED_ALREADY_SELLING"
  | "URGENT_REORDER_OPPORTUNITY"
  | "REORDER_OPPORTUNITY"
  | "AVAILABLE_BUT_NOT_PROFITABLE"
  | "UNMATCHED";

export function classifySupplierMatch(params: {
  matched: boolean;
  stockStatus?: "OOS" | "CRITICAL" | "NEAR_OOS" | "LOW_STOCK" | "HEALTHY";
  isProfitable: boolean;
}): SupplierMatchOutcome {
  if (!params.matched) return "UNMATCHED";
  if (params.stockStatus === "OOS" || params.stockStatus === "CRITICAL") return "URGENT_REORDER_OPPORTUNITY";
  if (params.stockStatus === "NEAR_OOS") return "REORDER_OPPORTUNITY";
  if (!params.isProfitable) return "AVAILABLE_BUT_NOT_PROFITABLE";
  return "MATCHED_ALREADY_SELLING";
}
