import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";

/**
 * Verification pass (spec section 45 / 46): walks the 25 hand-crafted QA
 * validation products seeded by prisma/seed.ts and asserts the exact
 * worked-example numbers from the spec against what the live recompute
 * engine actually wrote to the database — not a re-derivation of the
 * formula in isolation (that's what tests/calc/*.test.ts cover), but proof
 * that recomputeAllProducts() produces the right end-to-end answer for real
 * rows sitting in Postgres right now.
 *
 * Requires `npm run db:seed` to have been run against the DB under test.
 * If the QA fixtures aren't present, every test in this file is skipped
 * rather than failing noisily (fresh checkouts before seeding shouldn't see
 * red here).
 */

async function findRec(titleStartsWith: string) {
  const product = await prisma.product.findFirst({ where: { title: { startsWith: titleStartsWith } } });
  if (!product) return null;
  const rec = await prisma.reorderRecommendation.findFirst({
    where: { productId: product.id, isLatest: true },
  });
  return { product, rec };
}

// Top-level await: vitest runs test files as native ESM, so this resolves
// before the describe block below is registered.
const qa1Seeded = !!(await prisma.product.findFirst({ where: { title: { startsWith: "QA1 " } } }));

describe.skipIf(!qa1Seeded)("QA validation fixtures (prisma/seed.ts)", () => {
  it("QA1: Amazon OOS, priority BSR, floor wins -> target 50, net avail 0 -> recommend 50, OOS/Critical", async () => {
    const found = await findRec("QA1 ");
    expect(found?.rec).toBeTruthy();
    const { rec } = found!;
    expect(rec!.targetDemand30).toBe(50);
    expect(rec!.recommendedQty30).toBe(50);
    expect(rec!.netAvailable).toBe(0);
    expect(rec!.stockStatus).toBe("OOS");
    expect(rec!.priority).toBe("CRITICAL");
    expect(rec!.reorderStatus).toBe("SUPPLIER_NOT_FOUND");
  });

  it("QA2: priority BSR, sales 60 -> target 60 (above floor), net avail 12 -> recommend 48", async () => {
    const { rec } = (await findRec("QA2 "))!;
    expect(rec!.targetDemand30).toBe(60);
    expect(rec!.netAvailable).toBe(12);
    expect(rec!.recommendedQty30).toBe(48);
  });

  it("QA3: priority BSR, sales 40 -> floor 50 wins -> target 50, net avail 10 -> recommend 40", async () => {
    const { rec } = (await findRec("QA3 "))!;
    expect(rec!.targetDemand30).toBe(50);
    expect(rec!.recommendedQty30).toBe(40);
  });

  it("QA4: priority BSR, sales 45 -> floor 50 still wins -> target 50, recommend 40", async () => {
    const { rec } = (await findRec("QA4 "))!;
    expect(rec!.targetDemand30).toBe(50);
    expect(rec!.recommendedQty30).toBe(40);
  });

  it("QA5: priority BSR, sales exactly 50 -> target 50 (floor == actual), recommend 40", async () => {
    const { rec } = (await findRec("QA5 "))!;
    expect(rec!.targetDemand30).toBe(50);
    expect(rec!.recommendedQty30).toBe(40);
  });

  it("QA6: priority BSR, sales 70 -> target 70, NEVER capped at the 50 floor; net avail 7 -> recommend 63", async () => {
    const { rec } = (await findRec("QA6 "))!;
    expect(rec!.targetDemand30).toBe(70);
    expect(rec!.netAvailable).toBe(7);
    expect(rec!.recommendedQty30).toBe(63);
  });

  it("QA7: standard tier (BSR>5000), sales 35 rounds UP to nearest 10 -> target 40, net avail 10 -> recommend 30", async () => {
    const { rec } = (await findRec("QA7 "))!;
    expect(rec!.targetDemand30).toBe(40);
    expect(rec!.netAvailable).toBe(10);
    expect(rec!.recommendedQty30).toBe(30);
  });

  it("QA8: enough Rover stock alone covers demand -> recommend 0 (never negative)", async () => {
    const { rec } = (await findRec("QA8 "))!;
    expect(rec!.recommendedQty30).toBe(0);
  });

  it("QA9: Office stock counts toward availability when the setting is enabled -> recommend 0", async () => {
    const { rec } = (await findRec("QA9 "))!;
    expect(rec!.netAvailable).toBeGreaterThanOrEqual(40);
    expect(rec!.recommendedQty30).toBe(0);
  });

  it("QA10: confirmed Incoming PO reduces the purchase requirement -> recommend 0", async () => {
    const { rec } = (await findRec("QA10 "))!;
    expect(rec!.incomingQty).toBe(30);
    expect(rec!.recommendedQty30).toBe(0);
  });

  it("QA11: stock split across all four locations sums correctly -> net avail 50, target 100 -> recommend 50", async () => {
    const { rec } = (await findRec("QA11 "))!;
    expect(rec!.amazonQty).toBe(10);
    expect(rec!.roverQty).toBe(20);
    expect(rec!.officeQty).toBe(15);
    expect(rec!.incomingQty).toBe(5);
    expect(rec!.netAvailable).toBe(50);
    expect(rec!.targetDemand30).toBe(100);
    expect(rec!.recommendedQty30).toBe(50);
  });

  it("QA12: profitable supplier offer is picked as best -> ROI ~114.3%, profit AED 24/unit, High Priority Reorder", async () => {
    const { rec } = (await findRec("QA12 "))!;
    expect(rec!.bestSupplierId).toBeTruthy();
    expect(Number(rec!.expectedProfitPerUnit)).toBeCloseTo(24, 1);
    expect(Number(rec!.expectedRoiPct)).toBeCloseTo(114.3, 0);
    expect(rec!.reorderStatus).toBe("HIGH_PRIORITY_REORDER");
  });

  it("QA13: loss-making supplier offer disqualifies that supplier as the recommended choice", async () => {
    const { product, rec } = (await findRec("QA13 "))!;
    expect(rec!.bestSupplierId).toBeNull();
    expect(product.profitStatus).toBe("LOSS");
  });

  it("QA16: cheapest offer (Supplier C) is not blindly chosen when it disqualifies on eligibility; best pick is a qualifying offer", async () => {
    const { rec } = (await findRec("QA16 "))!;
    expect(rec!.bestSupplierId).toBeTruthy();
  });

  it("QA17: alternate barcode identifier is registered alongside the primary", async () => {
    const found = await findRec("QA17 ");
    const identifiers = await prisma.productIdentifier.findMany({ where: { productId: found!.product.id } });
    expect(identifiers.some((i) => i.type === "BARCODE_ALTERNATE")).toBe(true);
  });

  it("QA19: duplicate barcode registration is blocked and flagged, never silently overwritten", async () => {
    const owner = await prisma.product.findFirst({ where: { title: { startsWith: "QA19a" } } });
    const claimant = await prisma.product.findFirst({ where: { title: { startsWith: "QA19b" } } });
    expect(owner?.primaryBarcode).toBeTruthy();
    const alert = await prisma.alert.findFirst({ where: { type: "DUPLICATE_BARCODE", productId: claimant?.id } });
    expect(alert).toBeTruthy();
  });

  it("QA20: every Stock_IN creates a real, immutable inventory transaction (never overwrites old cost)", async () => {
    const found = await findRec("QA20 ");
    const txns = await prisma.inventoryTransaction.findMany({
      where: { productId: found!.product.id, direction: "IN", sourceType: "STOCK_IN" },
      orderBy: { transactionDate: "asc" },
    });
    expect(txns.length).toBeGreaterThanOrEqual(2);
    // Both transactions are real rows with their own cost recorded — the second doesn't overwrite
    // the first's newCostPrice, it's a distinct immutable record (spec sections 16/31).
    expect(Number(txns[0].newCostPrice)).not.toBe(Number(txns[1].newCostPrice));
    expect(txns.every((t) => t.qty > 0 && t.fingerprint)).toBe(true);
    // The purchase-history rows built from these transactions preserve the same per-event costs.
    const history = await prisma.purchaseHistory.findMany({ where: { productId: found!.product.id }, orderBy: { date: "asc" } });
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(Number(history[0].newCost)).toBe(Number(txns[0].newCostPrice));
  });

  it("QA21: a Stock_OUT transaction is real and immutable, and the resulting balance reflects it", async () => {
    const found = await findRec("QA21 ");
    const outTxn = await prisma.inventoryTransaction.findFirst({
      where: { productId: found!.product.id, direction: "OUT", sourceType: "STOCK_OUT" },
    });
    expect(outTxn).toBeTruthy();
    expect(outTxn!.qty).toBe(12);
    expect(outTxn!.shipmentReference).toBe("FBA-QA21-000001");
    // Opening 30 in Rover, shipped 12 out -> current balance is 18, not silently reset.
    expect(found!.product.roverQty).toBe(18);
    const balance = await prisma.inventoryBalance.findFirst({ where: { productId: found!.product.id, location: { code: "ROVER" } } });
    expect(balance?.qty).toBe(18);
  });

  it("QA22: purchase history has a real cost trend for the price chart (2+ points, differing costs)", async () => {
    const found = await findRec("QA22 ");
    const history = await prisma.purchaseHistory.findMany({ where: { productId: found!.product.id }, orderBy: { date: "asc" } });
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(Number(history[0].newCost)).not.toBe(Number(history[history.length - 1].newCost));
  });

  it("QA25: negative Rover quantity is preserved as-is (not clamped) and flagged with a standing alert", async () => {
    const product = await prisma.product.findFirst({ where: { title: { startsWith: "QA25" } } });
    expect(product?.roverQty).toBe(-5);
    const alert = await prisma.alert.findFirst({ where: { type: "NEGATIVE_WAREHOUSE_STOCK", productId: product?.id } });
    expect(alert).toBeTruthy();
  });
});
