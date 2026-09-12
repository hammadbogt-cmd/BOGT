import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

/**
 * End-to-end sync against a stubbed Google Sheets API, using the real column
 * headings from the live workbooks — including the totals/date banner that
 * sits above the header row. Exercises the whole path: header detection,
 * column mapping, bulk import, recompute, and the idempotency guarantee that
 * clicking Sync twice must not duplicate anything.
 */

const TAB_DATA: Record<string, unknown[][]> = {};

vi.mock("@/lib/sheets/google-client", () => ({
  getServiceAccountStatus: () => ({ configured: true, clientEmail: "test@example.iam.gserviceaccount.com" }),
  fetchTabValues: async (_spreadsheetId: string, tabName: string) => {
    const data = TAB_DATA[tabName];
    if (!data) throw new Error("Requested entity was not found");
    return data;
  },
}));

const { prisma } = await import("@/lib/prisma");
const { syncWorkbook } = await import("@/lib/sheets/sync");
const { ensureSheetConnectionsSeeded, WORKBOOK_A, WORKBOOK_B } = await import("@/lib/sheets/connections");
const { getListingStatusSummary } = await import("@/lib/reports/listing-status-summary");

const PREFIX = "TEST_SYNC_";
const BANNER = ["7- Sep- 2026", "", "", "", "", 4712, "", 27381];

const AMZ_HEADERS = [
  "Brand Name", "Products Pic", "Listing Status", "Pic Link", "AMZ Link", "BOGT BAR CODE", "Product Name",
  "Last Month sale ", "BSR", "inbound QTY", "Reserved Quantity", "unfulfillable-quantity", "ASIN",
  "units-shipped-t30", "Available QTY", "Available QTY Value", "SKU", "Cost Price", "Cost Price with VAT",
  "FBA FEE", "REFF FEE", "Breakeven Price", "featuredoffer-price ", "PROFIT & LOSS", "PROFIT%", "ROI",
  "Mini Price", "Our-price",
];

const OA_HEADERS = [
  "Brand Name", "Products Pic", "Listing Status", "Pic Link", "AMZ Link", "BOGT BAR CODE", "Product Name",
  "LAST MO. SALES", "BSR", "Inbound QTY", "Reserved QTY", "Unfulfillable-QTY", "ASIN", "Units-Shipped-t30",
  "available qty ", "Value", "SKU", "Cost Price", "Cost Price with VAT", "FBA FEE", "REFF FEE", "Breakeven Price",
  "featuredoffer-price ", "PROFIT & LOSS", "PROFIT%", "ROI", "Mini Price", "Our-price",
];

const ROVER_HEADERS = [
  "ASIN", "SKU", "Remarks", "BOGT Barcode", "A Brand", "Title", "Opening Stock", "Cost Price", "Cost Price With VAT",
  "Total IN", "Total OUT", "Current Stock IN Rover", "Current Stock IN Office", "Inventory Value", "QTY pr BOX",
  "Total Boxs", "Loose Open Box", "Shelve Location", "Status", "Check", "Price Update Check", "BrandViewHelper",
  "17-06-2026 Stock IN Rover", "Required QTY", "FBA Required QTY", "Quantity for other Plateform", "Price",
];

const STOCK_IN_HEADERS = [
  "Date", "Inovice ID", "Barcode", "Qty IN", "Current Stock ", "New Cost Price", "OLD Cost Price", "Brand",
  "Title", "Status", "Note", "Price Check", "ASIN",
];

const STOCK_OUT_HEADERS = [
  "Date", "Barcode", "Qty OUT", "Current Stock ", "Shipment Ref", "Brand", "Title", "FC Destination", "Status", "Note",
];

function amzRow(i: number, status: string, qty: number) {
  return [
    "Acme", "", status, "", "", `7700000000${100 + i}`, `${PREFIX}AMZ ${i}`, 20, 1500 + i, 0, 0, 0,
    `B0SYNCA${String(i).padStart(4, "0")}`, 25, qty, qty * 10, `SY-A-${i}`, 12, 12.6, 9, 3, 30, 45, 4, 12, 30, 40, 45,
  ];
}

function oaRow(i: number, status: string, qty: number) {
  return [
    "Acme", "", status, "", "", `8800000000${100 + i}`, `${PREFIX}OA ${i}`, 15, 2500 + i, 0, 0, 0,
    `B0SYNCU${String(i).padStart(4, "0")}`, 18, qty, qty * 20, `SY-U-${i}`, 40, 42, 10, 4, 80, 95, 5, 10, 25, 90, 95,
  ];
}

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
    await prisma.alert.deleteMany({ where: { productId: { in: ids } } });
  }
  await prisma.product.deleteMany({ where: { title: { startsWith: PREFIX } } });
  await prisma.importJob.deleteMany({ where: { sourceName: { in: [WORKBOOK_A, WORKBOOK_B] } } });
  await prisma.matchingQueue.deleteMany({ where: { rawTitle: { startsWith: PREFIX } } });
}

describe("workbook sync end-to-end (headers on row 2, real column names)", () => {
  let amzConnectionId = "";
  let roverConnectionId = "";

  beforeAll(async () => {
    await cleanup();

    TAB_DATA["All PRODUCTS STATS"] = [
      BANNER,
      AMZ_HEADERS,
      amzRow(1, "Buybox Win", 10),
      amzRow(2, "Selling at Loss", 4),
      amzRow(3, "Out of Stock", 0),
    ];
    TAB_DATA["OA USA Products"] = [BANNER, OA_HEADERS, oaRow(1, "Buybox Win", 6), oaRow(2, "Price Update No Buybox", 3)];
    TAB_DATA["BOGT IN Rover Master Stock"] = [
      ["", "", "", "", "", "", "", "", "", "", "", 31963, "", 1105091.74],
      ROVER_HEADERS,
      ["B0SYNCA0001", "SY-A-1", "", "7700000000101", "Acme", `${PREFIX}AMZ 1`, 50, 12, 12.6, 100, 40, 60, 5, 720,
        24, 2, 12, "A-01", "OK", "", "", "", "", 0, 0, 0, 45],
    ];
    TAB_DATA["Stock_IN"] = [
      STOCK_IN_HEADERS,
      ["03-Apr-2026", "INV-1", "7700000000101", 40, 60, 13, 12, "Acme", `${PREFIX}AMZ 1`, "OK", "", "", ""],
    ];
    TAB_DATA["Stock_OUT"] = [
      STOCK_OUT_HEADERS,
      ["05-Apr-2026", "7700000000101", 10, 50, "FBA-SHIP-1", "Acme", `${PREFIX}AMZ 1`, "FC1", "OK", ""],
    ];

    await ensureSheetConnectionsSeeded(prisma);
    const amz = await prisma.sheetConnection.findUniqueOrThrow({ where: { workbookName: WORKBOOK_A } });
    const rover = await prisma.sheetConnection.findUniqueOrThrow({ where: { workbookName: WORKBOOK_B } });
    amzConnectionId = amz.id;
    roverConnectionId = rover.id;
    await prisma.sheetConnection.updateMany({ data: { spreadsheetId: "TEST_SPREADSHEET_ID" } });
  });

  afterAll(cleanup);

  it("detects the header row and imports both Amazon tabs cleanly", async () => {
    const result = await syncWorkbook(amzConnectionId, prisma);

    expect(result.status).toBe("SUCCEEDED");
    expect(result.errors).toEqual([]);
    expect(result.tabsSynced.sort()).toEqual(["All PRODUCTS STATS", "OA USA Products"]);

    for (const tab of result.tabs) {
      expect(tab.status).toBe("OK");
      expect(tab.headerRow).toBe(2); // found below the totals banner
      expect(tab.errorCount).toBe(0);
    }

    const created = await prisma.product.count({ where: { title: { startsWith: PREFIX } } });
    expect(created).toBe(5);
  });

  it("reports which columns it used, so mapping can be checked from the screen", async () => {
    const result = await syncWorkbook(amzConnectionId, prisma);
    const tab = result.tabs.find((t) => t.tabName === "All PRODUCTS STATS")!;

    expect(tab.mappedColumns?.title).toBe("Product Name");
    expect(tab.mappedColumns?.buyBoxPrice).toBe("featuredoffer-price");
    expect(tab.mappedColumns?.referralFee).toBe("REFF FEE");
    expect(tab.headersSeen).toContain("PROFIT%");
  });

  it("does not duplicate anything when sync is run again", async () => {
    await syncWorkbook(amzConnectionId, prisma);
    await syncWorkbook(roverConnectionId, prisma);
    const productsAfterFirst = await prisma.product.count({ where: { title: { startsWith: PREFIX } } });
    const txnsAfterFirst = await prisma.inventoryTransaction.count({ where: { barcodeRaw: "7700000000101" } });

    await syncWorkbook(amzConnectionId, prisma);
    const second = await syncWorkbook(roverConnectionId, prisma);

    expect(await prisma.product.count({ where: { title: { startsWith: PREFIX } } })).toBe(productsAfterFirst);
    expect(await prisma.inventoryTransaction.count({ where: { barcodeRaw: "7700000000101" } })).toBe(txnsAfterFirst);
    expect(second.newStockInTxns).toBe(0); // already recorded, correctly skipped
    expect(second.newStockOutTxns).toBe(0);
  });

  it("records warehouse movements once, with the balance reflecting them", async () => {
    await syncWorkbook(roverConnectionId, prisma);

    const txns = await prisma.inventoryTransaction.findMany({ where: { barcodeRaw: "7700000000101" } });
    expect(txns.filter((t) => t.direction === "IN")).toHaveLength(1);
    expect(txns.filter((t) => t.direction === "OUT")).toHaveLength(1);

    // The Rover Master Stock tab is the authoritative CURRENT balance (its
    // own figure already reflects those movements), so a re-sync settles back
    // to the sheet's number rather than double-counting the transactions.
    const product = await prisma.product.findFirstOrThrow({ where: { primaryBarcode: "7700000000101" } });
    expect(product.roverQty).toBe(60);
  });

  it("feeds the calculated listing-status totals", async () => {
    await syncWorkbook(amzConnectionId, prisma);
    const summary = await getListingStatusSummary(prisma);

    // "All Products" counts the All PRODUCTS STATS catalog, "USA Products"
    // the OA tab — the same split the sheet used.
    const buyboxWin = summary.all.byStatus.find((s) => s.status === "Buybox Win")!;
    expect(buyboxWin.totalSku).toBeGreaterThanOrEqual(1);
    const usaBuyboxWin = summary.usa.byStatus.find((s) => s.status === "Buybox Win")!;
    expect(usaBuyboxWin.totalSku).toBeGreaterThanOrEqual(1);
    expect(summary.combined.totalSku).toBe(summary.all.totalSku + summary.usa.totalSku);

    const usaPriceUpdate = summary.usa.byStatus.find((s) => s.status === "Price Update No Buybox")!;
    expect(usaPriceUpdate.totalSku).toBeGreaterThanOrEqual(1);
    expect(usaPriceUpdate.totalSkuQty).toBeGreaterThanOrEqual(3);
  });

  it("explains a missing tab instead of failing silently", async () => {
    const saved = TAB_DATA["OA USA Products"];
    delete TAB_DATA["OA USA Products"];
    try {
      const result = await syncWorkbook(amzConnectionId, prisma);
      const tab = result.tabs.find((t) => t.tabName === "OA USA Products")!;
      expect(tab.status).toBe("FAILED");
      expect(tab.error).toMatch(/was not found in spreadsheet/i);
      // the other tab still syncs — one bad tab never blocks the rest
      expect(result.tabsSynced).toContain("All PRODUCTS STATS");
    } finally {
      TAB_DATA["OA USA Products"] = saved;
    }
  });

  it("names the missing column, and the row it read, when a header is renamed", async () => {
    const saved = TAB_DATA["All PRODUCTS STATS"];
    TAB_DATA["All PRODUCTS STATS"] = [
      BANNER,
      AMZ_HEADERS.map((h) => (h === "Product Name" ? "Item Description" : h)),
      amzRow(9, "Buybox Win", 1),
    ];
    try {
      const result = await syncWorkbook(amzConnectionId, prisma);
      const tab = result.tabs.find((t) => t.tabName === "All PRODUCTS STATS")!;
      expect(tab.status).toBe("SOURCE_MAPPING_ISSUE");
      expect(tab.missingRequired).toEqual(["title"]);
      expect(tab.headersSeen).toContain("Item Description");
      expect(result.errors.join(" ")).toMatch(/could not find column\(s\) title/i);
    } finally {
      TAB_DATA["All PRODUCTS STATS"] = saved;
    }
  });
});
