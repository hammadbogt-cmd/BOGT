import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { runImport } from "@/lib/import/run-import";
import { SheetData } from "@/lib/import/sheet-reader";

const PREFIX = "TEST_IMPORT_";

async function cleanup() {
  const products = await prisma.product.findMany({ where: { title: { startsWith: PREFIX } }, select: { id: true } });
  const ids = products.map((p) => p.id);
  if (ids.length > 0) {
    await prisma.reorderRecommendation.deleteMany({ where: { productId: { in: ids } } });
    await prisma.purchaseHistory.deleteMany({ where: { productId: { in: ids } } });
    await prisma.inventoryTransaction.deleteMany({ where: { productId: { in: ids } } });
    await prisma.inventoryBalance.deleteMany({ where: { productId: { in: ids } } });
    await prisma.amazonStats.deleteMany({ where: { productId: { in: ids } } });
    await prisma.salesHistory.deleteMany({ where: { productId: { in: ids } } });
    await prisma.productSourceMapping.deleteMany({ where: { productId: { in: ids } } });
    await prisma.productIdentifier.deleteMany({ where: { productId: { in: ids } } });
  }
  await prisma.matchingQueue.deleteMany({ where: { rawTitle: { startsWith: PREFIX } } });
  await prisma.alert.deleteMany({ where: { message: { startsWith: PREFIX } } });
  await prisma.product.deleteMany({ where: { title: { startsWith: PREFIX } } });
  await prisma.importJob.deleteMany({ where: { sourceName: { startsWith: PREFIX } } });
}

beforeAll(cleanup);
afterAll(cleanup);

function sheet(headers: string[], rows: Record<string, unknown>[]): SheetData {
  return { headers, rows };
}

describe("runImport — ALL PRODUCTS STATS", () => {
  it("creates a new product with identifiers and Amazon stats from header-mapped columns", async () => {
    const data = sheet(
      ["Brand Name", "BOGT BAR CODE", "Product Name", "BSR", "ASIN", "Units Shipped T30", "Available QTY", "SKU", "Cost Price", "Our Price"],
      [
        {
          "Brand Name": "Acme",
          "BOGT BAR CODE": "6001234567890",
          "Product Name": `${PREFIX}Import Widget`,
          BSR: 2000,
          ASIN: "B0IMPORT001",
          "Units Shipped T30": 45,
          "Available QTY": 5,
          SKU: "SKU-001",
          "Cost Price": 20,
          "Our Price": 45,
        },
      ]
    );

    const result = await runImport({
      targetEntity: "ALL_PRODUCTS_STATS",
      sourceType: "CSV",
      sourceName: `${PREFIX}Amazon Stats Test`,
      sheetData: data,
      recomputeAfter: true,
    });

    expect(result.status).toBe("SUCCEEDED");
    expect(result.counters.productsAdded).toBe(1);

    const product = await prisma.product.findFirst({ where: { title: `${PREFIX}Import Widget` } });
    expect(product).not.toBeNull();
    expect(product!.bsr).toBe(2000);
    expect(product!.amazonAvailableQty).toBe(5);
    // BSR<=5000, sales=45 -> target 50 per the tiered rule; reorder should reflect it.
    const rec = await prisma.reorderRecommendation.findFirst({ where: { productId: product!.id, isLatest: true } });
    expect(rec?.targetDemand30).toBe(50);
  });

  it("surfaces a SOURCE_MAPPING_ISSUE instead of importing wrong data when a required header is missing", async () => {
    const data = sheet(["Brand Name", "ASIN"], [{ "Brand Name": "Acme", ASIN: "B0X" }]); // missing "Product Name"

    const result = await runImport({
      targetEntity: "ALL_PRODUCTS_STATS",
      sourceType: "CSV",
      sourceName: `${PREFIX}Bad Mapping Test`,
      sheetData: data,
      recomputeAfter: false,
    });

    expect(result.status).toBe("FAILED");
    expect(result.mappingIssue?.missingRequired).toContain("title");
  });
});

describe("runImport — Stock_IN idempotency (spec section 48)", () => {
  it("re-importing identical rows never creates duplicate transactions", async () => {
    // First seed a product to match against.
    const product = await prisma.product.create({
      data: { title: `${PREFIX}StockIn Widget`, primaryBarcode: "7001234567890" },
    });
    await prisma.productIdentifier.create({ data: { productId: product.id, type: "BARCODE_PRIMARY", value: "7001234567890" } });

    const data = sheet(
      ["Date", "Invoice ID", "Barcode", "Qty IN", "New Cost Price", "Old Cost Price", "Supplier"],
      [{ Date: "01/09/2026", "Invoice ID": "INV-001", Barcode: "7001234567890", "Qty IN": 50, "New Cost Price": 23, "Old Cost Price": 20, Supplier: "BOGT" }]
    );

    const first = await runImport({
      targetEntity: "STOCK_IN",
      sourceType: "CSV",
      sourceName: `${PREFIX}StockIn Test`,
      sheetData: data,
      recomputeAfter: false,
    });
    expect(first.counters.newStockInTxns).toBe(1);

    const second = await runImport({
      targetEntity: "STOCK_IN",
      sourceType: "CSV",
      sourceName: `${PREFIX}StockIn Test`,
      sheetData: data,
      recomputeAfter: false,
    });
    expect(second.counters.newStockInTxns).toBe(0);
    expect(second.counters.rowsSkipped).toBe(1);

    const txnCount = await prisma.inventoryTransaction.count({ where: { productId: product.id } });
    expect(txnCount).toBe(1);

    const updated = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(updated.roverQty).toBe(50);
    expect(Number(updated.currentCost)).toBe(23);
    expect(updated.purchaseCount).toBe(1);
  });
});

describe("runImport — Stock_OUT negative-balance detection (validation case 25)", () => {
  it("flags an alert when Stock_OUT would drive the balance negative", async () => {
    const product = await prisma.product.create({
      data: { title: `${PREFIX}StockOut Widget`, primaryBarcode: "7009876543210", roverQty: 0 },
    });
    await prisma.productIdentifier.create({ data: { productId: product.id, type: "BARCODE_PRIMARY", value: "7009876543210" } });

    const data = sheet(
      ["Date", "Barcode", "Qty OUT", "Shipment Reference"],
      [{ Date: "02/09/2026", Barcode: "7009876543210", "Qty OUT": 10, "Shipment Reference": "FBA-XYZ" }]
    );

    await runImport({
      targetEntity: "STOCK_OUT",
      sourceType: "CSV",
      sourceName: `${PREFIX}StockOut Test`,
      sheetData: data,
      recomputeAfter: false,
    });

    const alert = await prisma.alert.findFirst({ where: { productId: product.id, type: "NEGATIVE_WAREHOUSE_STOCK" } });
    expect(alert).not.toBeNull();

    await prisma.alert.deleteMany({ where: { productId: product.id } });
    await prisma.inventoryTransaction.deleteMany({ where: { productId: product.id } });
    await prisma.inventoryBalance.deleteMany({ where: { productId: product.id } });
  });
});
