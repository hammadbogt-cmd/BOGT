/**
 * Canonical header definitions for every source tab this system understands.
 *
 * This is the single place that knows what a column is CALLED in the
 * spreadsheets. Everything downstream (CSV/XLSX import, Google Sheets sync)
 * works off HEADER NAMES resolved here, never fixed column letters/indices —
 * so if a source column moves, the import still works as long as the header
 * text is recognized (spec section 29/47: "if a source column moves, mapping
 * should still work if header is unchanged").
 *
 * Each logical field lists every header spelling we'll accept. Matching
 * ignores case, punctuation and hyphen/underscore/space differences, so
 * "Our-price", "OUR PRICE" and "Our Price" are all the same column — but the
 * WORDS have to match, which is why the real spellings from the live
 * workbooks ("REFF FEE", "featuredoffer-price", "LAST MO. SALES", "Inovice
 * ID", "Shelve Location") are all listed explicitly.
 */

export type TargetEntity =
  | "ALL_PRODUCTS_STATS"
  | "OA_USA_PRODUCTS"
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

/**
 * The two Amazon tabs carry the same column set with slightly different
 * spellings between them, so both spellings are accepted on both tabs.
 */
function amazonStatsFields(): FieldSpec[] {
  return [
    f("brand", false, "Brand Name", "Brand"),
    f("listingStatus", false, "Listing Status"),
    f("picLink", false, "Pic Link", "Products Pic"),
    f("amzLink", false, "AMZ Link", "Amazon Link"),
    f("barcode", false, "BOGT BAR CODE", "BOGT Barcode", "Barcode"),
    f("title", true, "Product Name", "Title", "Product Title"),
    f("lastMonthSale", false, "Last Month sale", "Last Month Sale", "LAST MO. SALES", "Last Mo Sales"),
    f("bsr", false, "BSR"),
    f("inboundQty", false, "inbound QTY", "Inbound QTY", "Inbound Qty", "Inbound Quantity"),
    f("reservedQty", false, "Reserved Quantity", "Reserved QTY", "Reserved Qty"),
    f("unfulfillableQty", false, "unfulfillable-quantity", "Unfulfillable-QTY", "Unfulfillable Quantity", "Unfulfillable Qty"),
    f("asin", false, "ASIN"),
    f("unitsShippedT30", false, "units-shipped-t30", "Units-Shipped-t30", "Units Shipped T30", "units shipped 30"),
    f("availableQty", false, "Available QTY", "available qty", "Available Qty", "Amazon Inventory"),
    f("availableQtyValue", false, "Available QTY Value", "Available Qty Value", "Value"),
    f("sku", false, "SKU"),
    f("costPrice", false, "Cost Price", "Cost"),
    f("costPriceVat", false, "Cost Price with VAT", "Cost Price With VAT", "VAT Cost"),
    f("fbaFee", false, "FBA FEE", "FBA Fee"),
    f("referralFee", false, "REFF FEE", "Reff Fee", "Referral Fee", "REF FEE"),
    f("breakevenPrice", false, "Breakeven Price", "Breakeven"),
    f("buyBoxPrice", false, "featuredoffer-price", "Featuredoffer Price", "Featured Offer Price", "Featured Offer", "Buy Box Price"),
    f("profitLoss", false, "PROFIT & LOSS", "Profit & Loss", "Profit and Loss", "Profit"),
    f("profitPct", false, "PROFIT%", "Profit %", "Profit Percent"),
    f("roi", false, "ROI"),
    f("miniPrice", false, "Mini Price", "Minimum Price", "Min Price"),
    f("ourPrice", false, "Our-price", "Our Price"),
    f("shipmentDateForMonth", false, "Shipment Date for Month"),
    f("lastShipmentQty", false, "Last Shipment Qty"),
  ];
}

export const ALL_PRODUCTS_STATS_SCHEMA: TabSchema = {
  targetEntity: "ALL_PRODUCTS_STATS",
  workbookName: "2026 BOGT AMZ Stock & Prices",
  tabName: "All PRODUCTS STATS",
  identityFields: ["barcode", "asin", "sku"],
  fields: amazonStatsFields(),
};

export const OA_USA_PRODUCTS_SCHEMA: TabSchema = {
  targetEntity: "OA_USA_PRODUCTS",
  workbookName: "2026 BOGT AMZ Stock & Prices",
  tabName: "OA USA Products",
  identityFields: ["barcode", "asin", "sku"],
  fields: amazonStatsFields(),
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
    f("barcode", false, "BOGT Barcode", "BOGT BAR CODE", "Barcode"),
    f("brand", false, "A Brand", "Brand", "Brand Name"),
    f("title", true, "Title", "Product Title", "Product Name"),
    f("openingStock", false, "Opening Stock"),
    f("costPrice", false, "Cost Price"),
    f("costPriceVat", false, "Cost Price With VAT", "Cost Price with VAT", "Cost Price with 5% VAT"),
    f("totalIn", false, "Total IN", "Total In"),
    f("totalOut", false, "Total OUT", "Total Out"),
    f("currentStockRover", false, "Current Stock IN Rover", "Current Stock in Rover"),
    f("currentStockOffice", false, "Current Stock IN Office", "Current Stock in Office"),
    f("inventoryValue", false, "Inventory Value"),
    f("qtyPerBox", false, "QTY pr BOX", "Qty per Box", "QTY per BOX"),
    f("totalBoxes", false, "Total Boxs", "Total Boxes"),
    f("looseOpenBox", false, "Loose Open Box", "Loose/Open Box"),
    f("shelfLocation", false, "Shelve Location", "Shelf Location"),
    f("stockStatus", false, "Status", "Stock Status"),
    f("duplicateBarcodeCheck", false, "Check", "Duplicate Barcode Check"),
    f("priceUpdateCheck", false, "Price Update Check"),
    f("brandViewHelper", false, "BrandViewHelper"),
    f("requiredQty", false, "Required QTY", "Required Qty"),
    f("fbaRequiredQty", false, "FBA Required QTY", "FBA Required Qty"),
    f("otherPlatformRequiredQty", false, "Quantity for other Plateform", "Quantity for other Platform", "Other Platform Required Qty"),
    f("price", false, "Price"),
  ],
};

export const STOCK_IN_SCHEMA: TabSchema = {
  targetEntity: "STOCK_IN",
  workbookName: "BOGT in Rover Live Stock 2026",
  tabName: "Stock_IN",
  identityFields: ["barcode"],
  fields: [
    f("date", true, "Date"),
    f("invoiceId", false, "Inovice ID", "Invoice ID", "Invoice Id", "Invoice No"),
    f("barcode", true, "Barcode", "BOGT Barcode"),
    f("qtyIn", true, "Qty IN", "Qty In"),
    f("currentStock", false, "Current Stock"),
    f("newCostPrice", false, "New Cost Price"),
    f("oldCostPrice", false, "OLD Cost Price", "Old Cost Price"),
    f("brand", false, "Brand"),
    f("productTitle", false, "Title", "Product Title"),
    f("status", false, "Status"),
    f("note", false, "Note", "Notes"),
    f("priceCheck", false, "Price Check"),
    f("asin", false, "ASIN"),
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
    f("barcode", true, "Barcode", "BOGT Barcode"),
    f("qtyOut", true, "Qty OUT", "Qty Out"),
    f("currentStock", false, "Current Stock"),
    f("shipmentReference", false, "Shipment Ref", "Shipment Reference"),
    f("brand", false, "Brand"),
    f("productTitle", false, "Title", "Product Title"),
    f("fcDestination", false, "FC Destination"),
    f("status", false, "Status"),
    f("note", false, "Note", "Notes"),
  ],
};

export const ALL_SCHEMAS: TabSchema[] = [
  ALL_PRODUCTS_STATS_SCHEMA,
  OA_USA_PRODUCTS_SCHEMA,
  ROVER_MASTER_STOCK_SCHEMA,
  STOCK_IN_SCHEMA,
  STOCK_OUT_SCHEMA,
];

export function schemaForTargetEntity(target: TargetEntity): TabSchema {
  const schema = ALL_SCHEMAS.find((s) => s.targetEntity === target);
  if (!schema) throw new Error(`No schema registered for target entity ${target}`);
  return schema;
}
