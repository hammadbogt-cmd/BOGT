import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/calc/settings";
import { calculateProfit, calculateBreakevenPrice, referralFeePct } from "@/lib/calc/profitability";

const S = DEFAULT_SETTINGS;

describe("referralFeePct", () => {
  it("uses the low tier at/under the threshold", () => {
    expect(referralFeePct(50, S)).toBe(0.08);
    expect(referralFeePct(10, S)).toBe(0.08);
  });
  it("uses the high tier above the threshold", () => {
    expect(referralFeePct(50.01, S)).toBe(0.1);
    expect(referralFeePct(200, S)).toBe(0.1);
  });
});

describe("calculateProfit (spec section 12)", () => {
  it("computes cost-with-vat, referral fee, and profit correctly for a low-tier price", () => {
    // cost 20, VAT 5% -> 21; selling 40 (<=50 tier, 8% referral); FBA default 9
    const r = calculateProfit({ sellingPrice: 40, purchaseCost: 20 }, S);
    expect(r.costWithVat).toBeCloseTo(21, 6);
    expect(r.referralFeePct).toBe(0.08);
    expect(r.referralFee).toBeCloseTo(3.2, 6);
    expect(r.fbaFee).toBe(9);
    expect(r.totalCost).toBeCloseTo(21 + 9 + 3.2, 6);
    expect(r.profit).toBeCloseTo(40 - (21 + 9 + 3.2), 6);
  });

  it("uses the high referral tier above the threshold price", () => {
    const r = calculateProfit({ sellingPrice: 100, purchaseCost: 50 }, S);
    expect(r.referralFeePct).toBe(0.1);
    expect(r.referralFee).toBeCloseTo(10, 6);
  });

  it("uses a product-specific FBA fee when provided instead of the default", () => {
    const r = calculateProfit({ sellingPrice: 40, purchaseCost: 20, fbaFee: 12.5 }, S);
    expect(r.fbaFee).toBe(12.5);
  });

  it("flags a loss-making supplier price (validation case 13)", () => {
    // High cost relative to selling price should produce negative profit.
    const r = calculateProfit({ sellingPrice: 25, purchaseCost: 24 }, S);
    expect(r.profit).toBeLessThan(0);
    expect(r.status).toBe("LOSS");
  });

  it("flags a profitable supplier price (validation case 12)", () => {
    const r = calculateProfit({ sellingPrice: 60, purchaseCost: 20 }, S);
    expect(r.profit).toBeGreaterThan(0);
    expect(["PROFITABLE", "HIGH_PROFIT"]).toContain(r.status);
  });

  it("ROI and margin are internally consistent with profit", () => {
    const r = calculateProfit({ sellingPrice: 55, purchaseCost: 22 }, S);
    expect(r.roiPct).toBeCloseTo((r.profit / r.costWithVat) * 100, 6);
    expect(r.marginPct).toBeCloseTo((r.profit / 55) * 100, 6);
  });
});

describe("calculateBreakevenPrice (true mathematical breakeven)", () => {
  it("solves for SP where profit is exactly zero, low tier", () => {
    const sp = calculateBreakevenPrice(20, S); // costWithVat=21, fba=9 -> low tier check
    const r = calculateProfit({ sellingPrice: sp, purchaseCost: 20 }, S);
    expect(r.profit).toBeCloseTo(0, 6);
  });

  it("solves for SP where profit is exactly zero when breakeven falls in the high tier", () => {
    const sp = calculateBreakevenPrice(60, S); // large cost pushes breakeven above 50 AED threshold
    expect(sp).toBeGreaterThan(S.referralThresholdPrice);
    const r = calculateProfit({ sellingPrice: sp, purchaseCost: 60 }, S);
    expect(r.profit).toBeCloseTo(0, 6);
  });
});
