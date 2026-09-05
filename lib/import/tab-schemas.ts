/**
 * Canonical header definitions for every source tab this system understands.
 *
 * This is the single place that knows what a column is CALLED in the
 * spreadsheets. Everything downstream (CSV/XLSX import today, Google Sheets
 * sync later) works off HEADER NAMES resolved here, never fixed column
 * letters/indices — so if a source sheet inserts or reorders a column, the
 * import still works as long as the header text is recognized (spec section
 * 29/47: "if a source column moves, mapping should still work if header is
 * unchanged").
 *
 * Each logical field lists every header spelling we'll accept (case/space
 * insensitive), so small variations across the two workbooks ("Cost" vs
 * "Cost Price", "VAT Cost" vs "Cost Price with VAT") still resolve.
 */

export type TargetEntity =
  | "ALL_PRODUCTS_STATS"
  | "OA_USA_PRODUCTS"
  | "TOTAL_LISTING_STATUS"
  | "ROVER_MASTER_STOCK"
  | "STOCK_IN"
  | "STOCK_OUT";

export interface FieldSpec {
  field: string;
  headerAliases: string[];
  required: boolean;
}

export interface TabSchema {
  targetEntity: TargetEntity;
  workbookName: string;
  tabName: string;
  fields: FieldSpec[];
  /** At least one of these logical fields must resolve for a row to be usable as identity. */
  identityFields: string[];
}

function f(field: string, required: boolean, ...headerAliases: string[]): FieldSpec {
  return { field, required, headerAliases };
}

export const ALL_PRODUCTS_STATS_SCHEMA: TabSchema = {
  targetEntity: "ALL_PRODUCTS_STATS",
  workbookName: "2026 BOGT AMZ Stock & Prices",
  tabName: "All PRODUCTS STATS",
  identityFields: ["barcode", "asin", "sku"],
  fields: [
    f("brand", false, "Brand Name", "Brand"),
    f("listingStatus", false, "Listing Status"),
    f("barcode", false, "BOGT BAR CODE", "Barcode", "BOGT Barcode"),
    f("title", true, "Product Name", "Title"),
    f("lastMonthSale", false, "Last Month Sale"),
    f("bsr", false, "BSR"),
    f("inboundQty", false, "Inbound QTY", "Inbound Qty"),
    f("reservedQty", false, "Reserved Quantity", "Reserved Qty"),
    f("unfulfillableQty", false, "Unfulfillable Quantity", "Unfulfillable Qty"),
    f("asin", false, "ASIN"),
    f("unitsShippedT30", false, "Units Shipped T30"),
    f("availableQty", false, "Available QTY", "Available Qty"),
    f("availableQtyValue", false, "Available QTY Value", "Available Qty Value"),
    f("sku", false, "SKU"),
    f("costPrice", false, "Cost Price"),
    f("costPriceVat", false, "Cost Price with VAT"),
    f("fbaFee", false, "FBA Fee"),
    f("referralFee", false, "Referral Fee"),
    f("breakevenPrice", false, "Breakeven Price"),
    f("buyBoxPrice", false, "Featured Offer Price / Buy Box Price", "Buy Box Price", "Featured Offer Price"),
    f("profitLoss", false, "Profit & Loss", "Profit and Loss"),
    f("profitPct", false, "Profit %"),
    f("roi", false, "ROI"),
    f("miniPrice", false, "Mini Price"),
    f("ourPrice", false, "Our Price"),
  ],
};

export const OA_USA_PRODUCTS_SCHEMA: TabSchema = {
  targetEntity: "OA_USA_PRODUCTS",
  workbookName: "2026 BOGT AMZ Stock & Prices",
  tabName: "OA USA Products",
  identityFields: ["barcode", "asin", "sku"],
  fields: [
    f("brand", false, "Brand"),
    f("barcode", false, "Barcode"),
    f("title", true, "Product Name", "Title"),
    f("bsr", false, "BSR"),
    f("availableQty", false, "Amazon Inventory"),
    f("asin", false, "ASIN"),
    f("unitsShippedT30", false, "Units Shipped T30"),
    f("sku", false, "SKU"),
    f("costPrice", false, "Cost"),
    f("costPriceVat", false, "VAT Cost"),
    f("fbaFee", false, "FBA Fee"),
    f("referralFee", false, "Referral Fee"),
    f("breakevenPrice", false, "Breakeven"),
    f("buyBoxPrice", false, "Featured Offer"),
    f("profitLoss", false, "Profit"),
    f("roi", false, "ROI"),
    f("miniPrice", false, "Minimum Price"),
    f("ourPrice", false, "Our Price"),
  ],
};

export const TOTAL_LISTING_STATUS_SCHEMA: TabSchema = {
  targetEntity: "TOTAL_LISTING_STATUS",
  workbookName: "2026 BOGT AMZ Stock & Prices",
  tabName: "Total Listng Status",
  identityFields: [],
  fields: [
    f("metric", false, "Metric", "Label"),
    f("totalSku", false, "Total SKU"),
    f("totalSkuQty", false, "Total SKU QTY"),
    f("totalValue", false, "Total Value"),
    f("last30DaysUnitSales", false, "Last 30 Days Unit Sales"),
  ],
};

export const ROVER_MASTER_STOCK_SCHEMA: TabSchema = {
  targetEntity: "ROVER_MASTER_STOCK",
  workbookName: "BOGT in Rover Live Stock 2026",
  tabName: "BOGT IN Rover Master Stock",
  identityFields: ["barcode", "asin", "sku"],
  fields: [
    f("asin", false, "ASIN"),
    f("sku", false, "SKU"),
    f("remarks", false, "Remarks"),
    f("barcode", false, "BOGT Barcode", "Barcode"),
    f("brand", false, "Brand"),
    f("title", true, "Title", "Product Title"),
    f("openingStock", false, "Opening Stock"),
    f("costPrice", false, "Cost Price"),
    f("costPriceVat", false, "Cost Price with 5% VAT", "Cost Price with VAT"),
    f("totalIn", false, "Total IN"),
    f("totalOut", false, "Total OUT"),
    f("currentStockRover", false, "Current Stock in Rover"),
    f("currentStockOffice", false, "Current Stock in Office"),
    f("inventoryValue", false, "Inventory Value"),
    f("qtyPerBox", false, "Qty per Box"),
    f("totalBoxes", false, "Total Boxes"),
    f("looseOpenBox", false, "Loose/Open Box"),
    f("shelfLocation", false, "Shelf Location"),
    f("stockStatus", false, "Stock Status"),
    f("duplicateBarcodeCheck", false, "Duplicate Barcode Check"),
    f("priceUpdateCheck", false, "Price Update Check"),
    f("previousDatedStock", false, "Previous/Dated Stock"),
    f("requiredQty", false, "Required Qty"),
    f("fbaRequiredQty", false, "FBA Required Qty"),
    f("otherPlatformRequiredQty", false, "Other Platform Required Qty"),
  ],
};

export const STOCK_IN_SCHEMA: TabSchema = {
  targetEntity: "STOCK_IN",
  workbookName: "BOGT in Rover Live Stock 2026",
  tabName: "Stock_IN",
  identityFields: ["barcode"],
  fields: [
    f("date", true, "Date"),
    f("invoiceId", false, "Invoice ID", "Invoice Id", "Invoice No"),
    f("barcode", true, "Barcode"),
    f("qtyIn", true, "Qty IN", "Qty In"),
    f("newCostPrice", false, "New Cost Price"),
    f("oldCostPrice", false, "Old Cost Price"),
    f("brand", false, "Brand"),
    f("productTitle", false, "Product Title", "Title"),
    f("supplierName", false, "Supplier", "Supplier Name"),
  ],
};

export const STOCK_OUT_SCHEMA: TabSchema = {
  targetEntity: "STOCK_OUT",
  workbookName: "BOGT in Rover Live Stock 2026",
  tabName: "Stock_OUT",
  identityFields: ["barcode"],
  fields: [
    f("date", true, "Date"),
    f("barcode", true, "Barcode"),
    f("qtyOut", true, "Qty OUT", "Qty Out"),
    f("currentStock", false, "Current Stock"),
    f("shipmentReference", false, "Shipment Reference"),
    f("brand", false, "Brand"),
    f("productTitle", false, "Product Title", "Title"),
    f("fcDestination", false, "FC Destination"),
  ],
};

export const ALL_SCHEMAS: TabSchema[] = [
  ALL_PRODUCTS_STATS_SCHEMA,
  OA_USA_PRODUCTS_SCHEMA,
  TOTAL_LISTING_STATUS_SCHEMA,
  ROVER_MASTER_STOCK_SCHEMA,
  STOCK_IN_SCHEMA,
  STOCK_OUT_SCHEMA,
];

export function schemaForTargetEntity(target: TargetEntity): TabSchema {
  const schema = ALL_SCHEMAS.find((s) => s.targetEntity === target);
  if (!schema) throw new Error(`No schema registered for target entity ${target}`);
  return schema;
}
