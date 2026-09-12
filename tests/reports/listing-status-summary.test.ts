import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { runImport } from "@/lib/import/run-import";
import { fromValuesMatrix } from "@/lib/import/sheet-reader";
import { getListingStatusSummary, bucketForStatus } from "@/lib/reports/listing-status-summary";

const PREFIX = "TEST_LSS_";

const HEADERS = [
  "Brand Name", "Listing Status", "BOGT BAR CODE", "Product Name", "BSR", "ASIN", "units-shipped-t30",
  "Available QTY", "Available QTY Value", "SKU", "Cost Price", "Our-price",
];

/** Row 1 is the totals banner the real sheets carry above the headers. */
function matrixFor(rows: (string | number)[][]): unknown[][] {
  return [["7- Sep- 2026", "", "", "", "", "", "", 4712], HEADERS, ...rows];
}

async function cleanup() {
  const products = await prisma.product.findMany({ where: { title: { startsWith: PREFIX } }, select: { id: true } });
  const ids = products.map((p) => p.id);
  if (ids.length > 0) {
    await prisma.reorderRecommendation.deleteMany({ where: { productId: { in: ids } } });
    await prisma.amazonStats.deleteMany({ where: { productId: { in: ids } } });
    await prisma.salesHistory.deleteMany({ where: { productId: { in: ids } } });
    await prisma.productSourceMapping.deleteMany({ where: { productId: { in: ids } } });
    await prisma.productIdentifier.deleteMany({ where: { productId: { in: ids } } });
    await prisma.alert.deleteMany({ where: { productId: { in: ids } } });
  }
  await prisma.product.deleteMany({ where: { title: { startsWith: PREFIX } } });
  await prisma.importJob.deleteMany({ where: { sourceName: { startsWith: PREFIX } } });
}

describe("listing status summary (replaces the Total Listng Status tab)", () => {
  beforeAll(async () => {
    await cleanup();

    // 3 main-catalog products, 2 of them Buybox Win.
    await runImport({
      targetEntity: "ALL_PRODUCTS_STATS",
      sourceType: "GOOGLE_SHEETS",
      sourceName: `${PREFIX}main`,
      sheetData: fromValuesMatrix(
        matrixFor([
          ["Acme", "Buybox Win", "9900000000101", `${PREFIX}A`, 1200, "B0LSSAAA001", 30, 10, 250.5, "LSS-A", 12, 25],
          ["Acme", "Buybox Win", "9900000000102", `${PREFIX}B`, 1300, "B0LSSAAA002", 5, 4, 100.25, "LSS-B", 12, 25],
          ["Acme", "Selling at Loss", "9900000000103", `${PREFIX}C`, 1400, "B0LSSAAA003", 2, 0, 0, "LSS-C", 30, 25],
        ]),
        2
      ),
      headerRow: 2,
      recomputeAfter: false,
    });

    // 2 USA (OA) products — these count in BOTH the overall and USA totals.
    await runImport({
      targetEntity: "OA_USA_PRODUCTS",
      sourceType: "GOOGLE_SHEETS",
      sourceName: `${PREFIX}usa`,
      sheetData: fromValuesMatrix(
        matrixFor([
          ["Acme", "Out of Stock", "9900000000201", `${PREFIX}USA1`, 900, "B0LSSUSA001", 7, 0, 0, "LSS-U1", 40, 90],
          ["Acme", "Price Update No Buybox", "9900000000202", `${PREFIX}USA2`, 800, "B0LSSUSA002", 11, 6, 480, "LSS-U2", 40, 90],
        ]),
        2
      ),
      headerRow: 2,
      recomputeAfter: false,
    });
  });

  afterAll(cleanup);

  it("matches sheet status wording to buckets, including near-miss spellings", () => {
    expect(bucketForStatus("Buybox Win").bucket).toBe("Buybox Win");
    expect(bucketForStatus("BUYBOX WIN").bucket).toBe("Buybox Win");
    expect(bucketForStatus("Buybox Win Profit less than 10%").bucket).toBe("Buybox Win Profit less then 10%");
    expect(bucketForStatus("No Buybox Our Price is High").bucket).toBe("No Buybox Our Price Is High");
    expect(bucketForStatus("").recognised).toBe(false);
    expect(bucketForStatus("Something New").bucket).toBe("Other");
  });

  it("totals SKUs, quantity, value and 30-day units for all products", async () => {
    const summary = await getListingStatusSummary(prisma);
    const mine = summary.all;

    // Other tests/fixtures may share the database, so assert on the buckets
    // these fixtures contribute to rather than on absolute grand totals.
    const buyboxWin = mine.byStatus.find((s) => s.status === "Buybox Win")!;
    expect(buyboxWin.totalSku).toBeGreaterThanOrEqual(2);
    expect(buyboxWin.totalSkuQty).toBeGreaterThanOrEqual(14); // 10 + 4
    expect(buyboxWin.totalValue).toBeGreaterThanOrEqual(350.75); // 250.50 + 100.25
    expect(buyboxWin.last30DaysUnitSales).toBeGreaterThanOrEqual(35); // 30 + 5
  });

  it("reports the two catalogs separately, the way the sheet did", async () => {
    const summary = await getListingStatusSummary(prisma);

    // USA figures come only from the OA USA Products tab.
    const usaOos = summary.usa.byStatus.find((s) => s.status === "Out of Stock")!;
    const usaPriceUpdate = summary.usa.byStatus.find((s) => s.status === "Price Update No Buybox")!;
    expect(usaOos.totalSku).toBeGreaterThanOrEqual(1);
    expect(usaPriceUpdate.totalSkuQty).toBeGreaterThanOrEqual(6);

    // ...and the main catalog's statuses must not leak into the USA view.
    const usaLoss = summary.usa.byStatus.find((s) => s.status === "Selling at Loss")!;
    expect(usaLoss.totalSku).toBe(0);
    const allLoss = summary.all.byStatus.find((s) => s.status === "Selling at Loss")!;
    expect(allLoss.totalSku).toBeGreaterThanOrEqual(1);

    // Combined is exactly the two added together.
    expect(summary.combined.totalSku).toBe(summary.all.totalSku + summary.usa.totalSku);
    expect(summary.combined.totalSkuQty).toBe(summary.all.totalSkuQty + summary.usa.totalSkuQty);
    expect(summary.combined.last30DaysUnitSales).toBe(summary.all.last30DaysUnitSales + summary.usa.last30DaysUnitSales);
  });

  it("always lists every known status bucket, even the empty ones", async () => {
    const summary = await getListingStatusSummary(prisma);
    const labels = summary.all.byStatus.map((s) => s.status);
    expect(labels).toContain("Buybox Win Profit less then 10%");
    expect(labels).toContain("BSR High Buybox WIN No Sale");
    expect(labels).toContain("Unfulfillable");
    expect(labels).toContain("Reserved");
  });

  it("keeps the per-status rows adding up to the headline totals", async () => {
    const summary = await getListingStatusSummary(prisma);
    for (const catalog of [summary.all, summary.usa, summary.combined]) {
      const skuSum = catalog.byStatus.reduce((s, r) => s + r.totalSku, 0);
      const qtySum = catalog.byStatus.reduce((s, r) => s + r.totalSkuQty, 0);
      const salesSum = catalog.byStatus.reduce((s, r) => s + r.last30DaysUnitSales, 0);
      expect(skuSum).toBe(catalog.totalSku);
      expect(qtySum).toBe(catalog.totalSkuQty);
      expect(salesSum).toBe(catalog.last30DaysUnitSales);
    }
  });
});
