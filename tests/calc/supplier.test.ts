import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/calc/settings";
import { pickBestSupplier, classifySupplierMatch } from "@/lib/calc/supplier";

const S = DEFAULT_SETTINGS;

describe("pickBestSupplier (spec sections 19-20)", () => {
  it("validation case 16: same product from multiple suppliers picks the cheapest qualifying one", () => {
    const offers = [
      { supplierId: "1", supplierName: "BOGT", price: 22, stockQty: 50, moq: null, leadTimeDays: 5, priorityWeight: 10 },
      { supplierId: "2", supplierName: "Rover Island", price: 24, stockQty: 100, moq: null, leadTimeDays: 3, priorityWeight: 20 },
      { supplierId: "3", supplierName: "Supplier C", price: 21.5, stockQty: 30, moq: null, leadTimeDays: 7, priorityWeight: 30 },
    ];
    const { best } = pickBestSupplier(offers, 60, 20, S);
    expect(best?.supplierName).toBe("Supplier C");
  });

  it("the cheapest supplier is skipped when it lacks sufficient stock (section 19)", () => {
    const offers = [
      { supplierId: "1", supplierName: "Cheap-but-short", price: 20, stockQty: 5, moq: null, leadTimeDays: 5, priorityWeight: 10 },
      { supplierId: "2", supplierName: "Reliable", price: 23, stockQty: 100, moq: null, leadTimeDays: 5, priorityWeight: 10 },
    ];
    const { best } = pickBestSupplier(offers, 60, 40, S);
    expect(best?.supplierName).toBe("Reliable");
  });

  it("the cheapest supplier is skipped when its price makes the purchase loss-making", () => {
    const offers = [
      { supplierId: "1", supplierName: "TooCheapToBeReal", price: 55, stockQty: 100, moq: null, leadTimeDays: 5, priorityWeight: 10 },
      { supplierId: "2", supplierName: "Fair", price: 20, stockQty: 100, moq: null, leadTimeDays: 5, priorityWeight: 10 },
    ];
    // selling price 60: supplier 1's cost of 55 would be a loss after fees.
    const { best, evaluated } = pickBestSupplier(offers, 60, 10, S);
    expect(evaluated.find((o) => o.supplierName === "TooCheapToBeReal")?.disqualifiedReasons).toContain("LOSS_MAKING");
    expect(best?.supplierName).toBe("Fair");
  });

  it("validation case 14/15: a supplier's own price increase or decrease flows straight through profit calc", () => {
    const before = pickBestSupplier(
      [{ supplierId: "1", supplierName: "S", price: 20, stockQty: 50, moq: null, leadTimeDays: 5, priorityWeight: 10 }],
      60,
      10,
      S
    ).best!;
    const afterIncrease = pickBestSupplier(
      [{ supplierId: "1", supplierName: "S", price: 26, stockQty: 50, moq: null, leadTimeDays: 5, priorityWeight: 10 }],
      60,
      10,
      S
    ).best!;
    expect(afterIncrease.profit).toBeLessThan(before.profit);
  });

  it("returns null when no offer is profitable or qualifying", () => {
    const offers = [
      { supplierId: "1", supplierName: "Bad", price: 58, stockQty: 100, moq: null, leadTimeDays: 5, priorityWeight: 10 },
    ];
    const { best } = pickBestSupplier(offers, 60, 10, S);
    expect(best).toBeNull();
  });
});

describe("classifySupplierMatch (spec section 18)", () => {
  it("unmatched barcode -> UNMATCHED (validation case 18)", () => {
    expect(classifySupplierMatch({ matched: false, isProfitable: true })).toBe("UNMATCHED");
  });
  it("matched + OOS -> URGENT_REORDER_OPPORTUNITY", () => {
    expect(classifySupplierMatch({ matched: true, stockStatus: "OOS", isProfitable: true })).toBe(
      "URGENT_REORDER_OPPORTUNITY"
    );
  });
  it("matched + near-OOS -> REORDER_OPPORTUNITY", () => {
    expect(classifySupplierMatch({ matched: true, stockStatus: "NEAR_OOS", isProfitable: true })).toBe(
      "REORDER_OPPORTUNITY"
    );
  });
  it("matched + healthy stock but loss-making -> AVAILABLE_BUT_NOT_PROFITABLE", () => {
    expect(classifySupplierMatch({ matched: true, stockStatus: "HEALTHY", isProfitable: false })).toBe(
      "AVAILABLE_BUT_NOT_PROFITABLE"
    );
  });
  it("matched + healthy + profitable -> MATCHED_ALREADY_SELLING", () => {
    expect(classifySupplierMatch({ matched: true, stockStatus: "HEALTHY", isProfitable: true })).toBe(
      "MATCHED_ALREADY_SELLING"
    );
  });
});
