import { describe, it, expect } from "vitest";
import { detectHeaderRow, resolveColumnMap } from "@/lib/import/header-mapping";
import { fromValuesMatrix } from "@/lib/import/sheet-reader";
import {
  ALL_PRODUCTS_STATS_SCHEMA,
  OA_USA_PRODUCTS_SCHEMA,
  ROVER_MASTER_STOCK_SCHEMA,
  STOCK_IN_SCHEMA,
  STOCK_OUT_SCHEMA,
} from "@/lib/import/tab-schemas";

/**
 * These are the exact header spellings from the live workbooks. If a column
 * is ever renamed in the sheet, the matching test here fails loudly instead
 * of the sync silently reporting a missing column.
 */
const ALL_PRODUCTS_STATS_HEADERS = [
  "Brand Name", "Products Pic", "Listing Status", "Pic Link", "AMZ Link", "BOGT BAR CODE", "Product Name",
  "Last Month sale ", "BSR ", "inbound QTY", "Reserved Quantity", "unfulfillable-quantity", "ASIN",
  "units-shipped-t30", "Available QTY", "Available QTY Value", "SKU", "Cost Price", "Cost Price with VAT",
  "FBA FEE", "REFF FEE", "Breakeven Price", "featuredoffer-price ", "PROFIT & LOSS", "PROFIT%", "ROI",
  "Mini Price", "Our-price",
];

const OA_USA_HEADERS = [
  "Brand Name", "Products Pic", "Listing Status", "Pic Link", "AMZ Link", "BOGT BAR CODE", "Product Name",
  "LAST MO. SALES", "BSR  ", "Inbound QTY", "Reserved QTY  ", "Unfulfillable-QTY   ", "ASIN", "Units-Shipped-t30 ",
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

describe("live workbook headers resolve against the tab schemas", () => {
  const cases: [string, string[], typeof ALL_PRODUCTS_STATS_SCHEMA][] = [
    ["All PRODUCTS STATS", ALL_PRODUCTS_STATS_HEADERS, ALL_PRODUCTS_STATS_SCHEMA],
    ["OA USA Products", OA_USA_HEADERS, OA_USA_PRODUCTS_SCHEMA],
    ["BOGT IN Rover Master Stock", ROVER_HEADERS, ROVER_MASTER_STOCK_SCHEMA],
    ["Stock_IN", STOCK_IN_HEADERS, STOCK_IN_SCHEMA],
    ["Stock_OUT", STOCK_OUT_HEADERS, STOCK_OUT_SCHEMA],
  ];

  for (const [name, headers, schema] of cases) {
    it(`${name}: every required column is found`, () => {
      const resolved = resolveColumnMap(headers, schema);
      expect(resolved.missingRequired).toEqual([]);
      expect(resolved.status).toBe("OK");
    });
  }

  it("maps the awkward Amazon spellings to the right fields", () => {
    const { map } = resolveColumnMap(ALL_PRODUCTS_STATS_HEADERS, ALL_PRODUCTS_STATS_SCHEMA);
    expect(map.title).toBe("Product Name");
    expect(map.referralFee).toBe("REFF FEE");
    expect(map.buyBoxPrice).toBe("featuredoffer-price ");
    expect(map.profitPct).toBe("PROFIT%");
    expect(map.ourPrice).toBe("Our-price");
    expect(map.unfulfillableQty).toBe("unfulfillable-quantity");
    expect(map.unitsShippedT30).toBe("units-shipped-t30");
  });

  it("maps the OA spelling variants of the same columns", () => {
    const { map } = resolveColumnMap(OA_USA_HEADERS, OA_USA_PRODUCTS_SCHEMA);
    expect(map.lastMonthSale).toBe("LAST MO. SALES");
    expect(map.availableQty).toBe("available qty ");
    expect(map.availableQtyValue).toBe("Value");
    expect(map.unfulfillableQty).toBe("Unfulfillable-QTY   ");
  });

  it("maps the Rover warehouse columns, including the odd spellings", () => {
    const { map } = resolveColumnMap(ROVER_HEADERS, ROVER_MASTER_STOCK_SCHEMA);
    expect(map.brand).toBe("A Brand");
    expect(map.currentStockRover).toBe("Current Stock IN Rover");
    expect(map.currentStockOffice).toBe("Current Stock IN Office");
    expect(map.shelfLocation).toBe("Shelve Location");
    expect(map.qtyPerBox).toBe("QTY pr BOX");
    expect(map.totalBoxes).toBe("Total Boxs");
    expect(map.otherPlatformRequiredQty).toBe("Quantity for other Plateform");
  });

  it("accepts the misspelled Stock_IN invoice column", () => {
    const { map } = resolveColumnMap(STOCK_IN_HEADERS, STOCK_IN_SCHEMA);
    expect(map.invoiceId).toBe("Inovice ID");
  });
});

describe("detectHeaderRow", () => {
  const summaryRow = ["7- Sep- 2026", "", "", "", "", "", "", "", "", 4712, 963, 214, "", 27381];

  it("finds headers on row 2 when a totals/date banner sits above them", () => {
    const matrix = [summaryRow, ALL_PRODUCTS_STATS_HEADERS, ["Abib", "", "Buybox Win", "", "", "8801", "A product"]];
    const detection = detectHeaderRow(matrix, ALL_PRODUCTS_STATS_SCHEMA);
    expect(detection.headerRow).toBe(2);
    expect(detection.resolved.status).toBe("OK");
  });

  it("still finds headers on row 1 when there is no banner", () => {
    const matrix = [STOCK_OUT_HEADERS, ["03-Apr-2026", "8809982768524", 50, 120, "FBA15LLSJM5J"]];
    const detection = detectHeaderRow(matrix, STOCK_OUT_SCHEMA);
    expect(detection.headerRow).toBe(1);
    expect(detection.resolved.status).toBe("OK");
  });

  it("reads data rows from below the detected header row", () => {
    const matrix = [summaryRow, ALL_PRODUCTS_STATS_HEADERS, ["Abib", "", "Buybox Win", "", "", "8801", "A product"]];
    const detection = detectHeaderRow(matrix, ALL_PRODUCTS_STATS_SCHEMA);
    const sheet = fromValuesMatrix(matrix, detection.headerRow);
    expect(sheet.rows).toHaveLength(1);
    expect(sheet.rows[0]["Product Name"]).toBe("A product");
    expect(sheet.rows[0]["Brand Name"]).toBe("Abib");
  });

  it("reports what it looked at when nothing matches, instead of failing blind", () => {
    const matrix = [["nothing", "useful", "here"], ["also", "not", "headers"]];
    const detection = detectHeaderRow(matrix, ALL_PRODUCTS_STATS_SCHEMA);
    expect(detection.resolved.status).toBe("SOURCE_MAPPING_ISSUE");
    expect(detection.resolved.missingRequired).toContain("title");
    expect(detection.attempts.length).toBe(2);
    expect(detection.attempts[0].sample).toContain("nothing");
  });

  it("lists columns present in the sheet that the mapping does not use", () => {
    const resolved = resolveColumnMap([...ALL_PRODUCTS_STATS_HEADERS, "Some Extra Column"], ALL_PRODUCTS_STATS_SCHEMA);
    expect(resolved.unmatchedHeaders).toContain("Some Extra Column");
    expect(resolved.status).toBe("OK");
  });
});
