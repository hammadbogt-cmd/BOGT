import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/calc/settings";
import {
  targetDemand,
  calculateRecommendedQty,
  netAvailable,
  daysOfStock,
  averageDailySales,
  classifyStockStatus,
  calculatePriority,
} from "@/lib/calc/reorder";

const S = DEFAULT_SETTINGS;

describe("targetDemand — BSR-tiered rule (spec section 7)", () => {
  // Validation cases 3-6: BSR <= 5000
  it.each([
    [40, 50],
    [45, 50],
    [50, 50],
  ])("BSR<=5000, sales=%i -> target %i (floor wins)", (sales, expected) => {
    expect(targetDemand(sales, 2800, 30, S)).toBe(expected);
  });

  it("BSR<=5000, sales=70 -> target follows actual demand, never capped at 50 (case 6)", () => {
    expect(targetDemand(70, 2800, 30, S)).toBe(70);
  });

  // Validation case 7: BSR > 5000
  it("BSR>5000, sales=35 -> rounds up to 40 (conservative standard-tier rule)", () => {
    expect(targetDemand(35, 8000, 30, S)).toBe(40);
  });

  it("treats a null/unknown BSR as the standard (non-priority) tier", () => {
    expect(targetDemand(35, null, 30, S)).toBe(40);
  });

  it("scales the floor and rounding proportionally for a 60-day window", () => {
    expect(targetDemand(80, 2800, 60, S)).toBe(100); // floor scales 50->100
    expect(targetDemand(110, 2800, 60, S)).toBe(110); // actual demand still wins above the floor
  });
});

describe("net availability + recommended qty (spec section 8, worked example)", () => {
  it("matches the spec's worked example exactly: target 50, available 13 -> recommend 37", () => {
    const breakdown = calculateRecommendedQty(
      50,
      0,
      { amazonQty: 5, roverQty: 8, officeQty: 0, incomingQty: 0 },
      S
    );
    expect(breakdown.netAvailable).toBe(13);
    expect(breakdown.recommendedQty).toBe(37);
  });

  it("matches the smart-recommendation worked example (spec section 20): target 50, net 7 -> 43", () => {
    const breakdown = calculateRecommendedQty(
      50,
      0,
      { amazonQty: 4, roverQty: 3, officeQty: 0, incomingQty: 0 },
      S
    );
    expect(breakdown.netAvailable).toBe(7);
    expect(breakdown.recommendedQty).toBe(43);
  });

  it("never recommends a negative quantity — floors at zero", () => {
    const breakdown = calculateRecommendedQty(
      20,
      0,
      { amazonQty: 50, roverQty: 50, officeQty: 0, incomingQty: 0 },
      S
    );
    expect(breakdown.recommendedQty).toBe(0);
  });

  it("validation case 8: enough Rover stock alone satisfies demand", () => {
    const breakdown = calculateRecommendedQty(30, 0, { amazonQty: 0, roverQty: 40, officeQty: 0, incomingQty: 0 }, S);
    expect(breakdown.recommendedQty).toBe(0);
  });

  it("validation case 9: office stock counts toward availability when enabled", () => {
    const breakdown = calculateRecommendedQty(30, 0, { amazonQty: 0, roverQty: 0, officeQty: 40, incomingQty: 0 }, S);
    expect(breakdown.recommendedQty).toBe(0);
  });

  it("validation case 9b: office stock excluded from availability when the admin setting is off", () => {
    const settingsNoOffice = { ...S, includeOfficeStockInAvailability: false };
    const breakdown = calculateRecommendedQty(30, 0, { amazonQty: 0, roverQty: 0, officeQty: 40, incomingQty: 0 }, settingsNoOffice);
    expect(breakdown.recommendedQty).toBe(30);
  });

  it("validation case 10: confirmed incoming PO qty reduces the requirement", () => {
    const breakdown = calculateRecommendedQty(30, 0, { amazonQty: 0, roverQty: 0, officeQty: 0, incomingQty: 30 }, S);
    expect(breakdown.recommendedQty).toBe(0);
  });

  it("validation case 11: stock split across multiple locations sums correctly", () => {
    const breakdown = calculateRecommendedQty(
      100,
      0,
      { amazonQty: 10, roverQty: 20, officeQty: 15, incomingQty: 5 },
      S
    );
    expect(breakdown.netAvailable).toBe(50);
    expect(breakdown.recommendedQty).toBe(50);
  });

  it("safety stock increases the recommended quantity", () => {
    const breakdown = calculateRecommendedQty(50, 10, { amazonQty: 5, roverQty: 8, officeQty: 0, incomingQty: 0 }, S);
    expect(breakdown.recommendedQty).toBe(47); // 50+10-13
  });

  it("always includes a human-readable formula breakdown for transparency (section 43)", () => {
    const breakdown = calculateRecommendedQty(50, 0, { amazonQty: 4, roverQty: 3, officeQty: 0, incomingQty: 0 }, S);
    expect(breakdown.formula).toContain("Target(50)");
    expect(breakdown.formula).toContain("Amazon(4)");
    expect(breakdown.formula).toContain("43");
  });
});

describe("days of stock + status thresholds (spec section 10)", () => {
  it("matches the worked example: 60 sales/30days=2/day, 10 available -> 5 days", () => {
    const avg = averageDailySales(60);
    expect(avg).toBe(2);
    expect(daysOfStock(10, avg)).toBe(5);
  });

  it("classifies status against configurable thresholds", () => {
    expect(classifyStockStatus(0, 0, S)).toBe("OOS");
    expect(classifyStockStatus(5, 10, S)).toBe("CRITICAL");
    expect(classifyStockStatus(10, 10, S)).toBe("NEAR_OOS");
    expect(classifyStockStatus(25, 10, S)).toBe("LOW_STOCK");
    expect(classifyStockStatus(45, 10, S)).toBe("HEALTHY");
  });

  it("validation case 1: an Amazon-OOS product with zero net availability is OOS regardless of sales velocity", () => {
    expect(classifyStockStatus(null, 0, S)).toBe("OOS");
  });

  it("validation case 2: near-OOS product falls inside the configured near-OOS band", () => {
    expect(classifyStockStatus(12, 12, S)).toBe("NEAR_OOS");
  });

  it("thresholds are fully configurable, not hardcoded", () => {
    const customSettings = { ...S, criticalStockDaysMax: 3, nearOosDaysMax: 6, lowStockDaysMax: 14 };
    expect(classifyStockStatus(5, 5, customSettings)).toBe("NEAR_OOS");
  });
});

describe("netAvailable formula (section 5/8)", () => {
  it("sums all four components when office stock is enabled", () => {
    expect(netAvailable({ amazonQty: 1, roverQty: 2, officeQty: 3, incomingQty: 4 }, S)).toBe(10);
  });
  it("excludes office when disabled", () => {
    const s2 = { ...S, includeOfficeStockInAvailability: false };
    expect(netAvailable({ amazonQty: 1, roverQty: 2, officeQty: 3, incomingQty: 4 }, s2)).toBe(7);
  });
});

describe("calculatePriority", () => {
  it("a profitable, priority-BSR product that is OOS is CRITICAL priority", () => {
    expect(
      calculatePriority({ bsr: 1000, stockStatus: "OOS", recommendedQty: 40, hasSupplier: true, isProfitable: true }, S)
    ).toBe("CRITICAL");
  });

  it("a non-profitable reorder is never escalated to HIGH/CRITICAL even if OOS", () => {
    expect(
      calculatePriority({ bsr: 1000, stockStatus: "OOS", recommendedQty: 40, hasSupplier: true, isProfitable: false }, S)
    ).toBe("LOW");
  });

  it("zero recommended quantity means no reorder priority at all", () => {
    expect(
      calculatePriority({ bsr: 1000, stockStatus: "HEALTHY", recommendedQty: 0, hasSupplier: true, isProfitable: true }, S)
    ).toBe("NONE");
  });
});
