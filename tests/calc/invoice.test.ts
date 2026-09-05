import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/calc/settings";
import { classifyInvoiceLine } from "@/lib/calc/invoice";

const S = DEFAULT_SETTINGS;

describe("classifyInvoiceLine (spec sections 24-25)", () => {
  it("validation case 23: invoice price above historical cost is flagged as an increase", () => {
    const r = classifyInvoiceLine(
      {
        matched: true,
        matchedByBarcode: true,
        invoicePrice: 24,
        invoiceQty: 50,
        lastPurchasePrice: 20,
      },
      S
    );
    // spec worked example: 20 -> 24 is +4 / +20%
    expect(r.priceDiff).toBeCloseTo(4, 6);
    expect(r.priceDiffPct).toBeCloseTo(0.2, 6);
    expect(r.statuses).toContain("LARGE_PRICE_INCREASE"); // 20% exceeds the default 15% "large" threshold
  });

  it("a small increase under the large-increase threshold is PRICE_INCREASED, not LARGE_PRICE_INCREASE", () => {
    const r = classifyInvoiceLine(
      { matched: true, matchedByBarcode: true, invoicePrice: 21, invoiceQty: 10, lastPurchasePrice: 20 },
      S
    );
    expect(r.statuses).toContain("PRICE_INCREASED");
    expect(r.statuses).not.toContain("LARGE_PRICE_INCREASE");
  });

  it("a lower invoice price than history is PRICE_DECREASED", () => {
    const r = classifyInvoiceLine(
      { matched: true, matchedByBarcode: true, invoicePrice: 18, invoiceQty: 10, lastPurchasePrice: 20 },
      S
    );
    expect(r.statuses).toContain("PRICE_DECREASED");
  });

  it("validation case 24: a better current supplier price is surfaced alongside the price-change status", () => {
    const r = classifyInvoiceLine(
      {
        matched: true,
        matchedByBarcode: true,
        invoicePrice: 24,
        invoiceQty: 50,
        lastPurchasePrice: 20,
        bestCurrentSupplierPrice: 21,
      },
      S
    );
    expect(r.statuses).toContain("BETTER_SUPPLIER_AVAILABLE");
  });

  it("validation case 19: an unmatched barcode is flagged distinctly from an unknown product", () => {
    const r = classifyInvoiceLine({ matched: false, matchedByBarcode: false, invoicePrice: 10, invoiceQty: 1 }, S);
    expect(r.primaryStatus).toBe("BARCODE_NOT_MATCHED");
  });

  it("prioritizes last actual purchase price over a stale master-cost column (section 25)", () => {
    const r = classifyInvoiceLine(
      {
        matched: true,
        matchedByBarcode: true,
        invoicePrice: 22,
        invoiceQty: 10,
        lastPurchasePrice: 22, // should read as PRICE_OK
        currentMasterCost: 10, // an irrelevant/stale value that would otherwise scream "increase"
      },
      S
    );
    expect(r.referencePriceSource).toBe("LAST_PURCHASE_PRICE");
    expect(r.statuses).toContain("PRICE_OK");
  });

  it("flags a qty difference against an expected PO quantity", () => {
    const r = classifyInvoiceLine(
      { matched: true, matchedByBarcode: true, invoicePrice: 20, invoiceQty: 45, expectedQty: 50, lastPurchasePrice: 20 },
      S
    );
    expect(r.statuses).toContain("QTY_DIFFERENCE");
  });

  it("flags a loss when the invoice price makes the product unprofitable at the current selling price", () => {
    const r = classifyInvoiceLine(
      {
        matched: true,
        matchedByBarcode: true,
        invoicePrice: 24,
        invoiceQty: 10,
        lastPurchasePrice: 20,
        currentSellingPrice: 25,
      },
      S
    );
    expect(r.statuses).toContain("LOSS");
    expect(r.profit).toBeLessThan(0);
  });
});
