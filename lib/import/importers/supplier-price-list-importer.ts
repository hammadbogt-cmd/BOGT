import type { PrismaClient } from "@prisma/client";
import type { SheetData } from "../sheet-reader";
import { resolveColumnMap } from "../header-mapping";
import type { TabSchema } from "../tab-schemas";
import { parseNumberOrNull, parseIntOrNull, parseStringOrNull } from "../value-parsers";
import { matchProduct } from "../../matching/match-product";

function f(field: string, required: boolean, ...headerAliases: string[]) {
  return { field, required, headerAliases };
}

/**
 * A supplier price list isn't one fixed workbook like the two Google Sheets
 * sources — every supplier hands us their own file — so this schema is kept
 * separate from tab-schemas.ts's ALL_SCHEMAS/TargetEntity registry (which is
 * specifically for the two canonical catalog workbooks). It reuses the same
 * header-alias resolution mechanic so a reordered or renamed-but-recognized
 * column still works (spec section 29/47).
 */
export const SUPPLIER_PRICE_LIST_SCHEMA: TabSchema = {
  targetEntity: "STOCK_IN" as never, // unused placeholder; this schema is never routed through runImport()
  workbookName: "Supplier Price List",
  tabName: "Price List",
  identityFields: ["barcode", "asin", "sku"],
  fields: [
    f("barcode", false, "Barcode", "BOGT Barcode", "EAN", "UPC", "Bar Code"),
    f("asin", false, "ASIN"),
    f("sku", false, "SKU", "Supplier SKU", "Item Code", "Item No"),
    f("title", false, "Product Name", "Title", "Description", "Item Description"),
    f("price", true, "Price", "Cost", "Cost Price", "Unit Price", "Unit Cost"),
    f("stockQty", false, "Stock", "Stock Qty", "Available Qty", "Qty Available", "Quantity"),
    f("moq", false, "MOQ", "Minimum Order Qty", "Min Order Qty"),
    f("leadTimeDays", false, "Lead Time", "Lead Time Days", "Lead Time (Days)"),
    f("casePack", false, "Case Pack", "Pack Size"),
  ],
};

export interface SupplierPriceListRowResult {
  rowNumber: number;
  status: "CREATED" | "UPDATED" | "UNCHANGED" | "UNMATCHED" | "ERROR";
  productId?: string;
  productTitle?: string;
  barcode?: string | null;
  asin?: string | null;
  sku?: string | null;
  price?: number | null;
  previousPrice?: number | null;
  priceDirection?: "NEW" | "INCREASED" | "DECREASED" | "UNCHANGED" | null;
  error?: string;
}

export interface SupplierPriceListImportResult {
  importJobId: string;
  rowsRead: number;
  created: number;
  updated: number;
  unchanged: number;
  unmatched: number;
  errors: number;
  affectedProductIds: string[];
  rows: SupplierPriceListRowResult[];
  mappingIssue: { missingRequired: string[] } | null;
}

const PRICE_EPSILON = 0.005;

export async function importSupplierPriceList(
  client: PrismaClient,
  supplierId: string,
  sheet: SheetData,
  sourceName: string,
  triggeredById?: string | null,
  sourceType: "CSV" | "XLSX" = "CSV"
): Promise<SupplierPriceListImportResult> {
  const resolved = resolveColumnMap(sheet.headers, SUPPLIER_PRICE_LIST_SCHEMA);
  const hasIdentity = !!(resolved.map.barcode || resolved.map.asin || resolved.map.sku);
  const hasPrice = !!resolved.map.price;
  const supplierForAlerts = await client.supplier.findUnique({ where: { id: supplierId }, select: { name: true } });
  const supplierName = supplierForAlerts?.name ?? "A supplier";

  const job = await client.importJob.create({
    data: {
      sourceType: sourceType as never,
      sourceName,
      tabName: "Supplier Price List",
      status: "RUNNING",
      triggeredById: triggeredById ?? undefined,
    },
  });

  if (!hasIdentity || !hasPrice) {
    const missingRequired = [
      ...(!hasIdentity ? ["barcode/ASIN/SKU (at least one required)"] : []),
      ...(!hasPrice ? ["price"] : []),
    ];
    await client.importJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        mappingErrors: missingRequired.length,
        summary: { missingRequired, headersSeen: sheet.headers },
      },
    });
    await client.alert.create({
      data: {
        type: "SOURCE_MAPPING_ISSUE",
        severity: "CRITICAL",
        message: `${sourceName}: missing required column(s) ${missingRequired.join(", ")}`,
        metadata: { importJobId: job.id, missing: missingRequired },
      },
    });
    return {
      importJobId: job.id,
      rowsRead: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      unmatched: 0,
      errors: 0,
      affectedProductIds: [],
      rows: [],
      mappingIssue: { missingRequired },
    };
  }

  const rows: SupplierPriceListRowResult[] = [];
  const affectedProductIds = new Set<string>();
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let unmatched = 0;
  let errors = 0;

  for (let i = 0; i < sheet.rows.length; i++) {
    const raw = sheet.rows[i];
    const rowNumber = i + 2; // account for header row
    const barcode = parseStringOrNull(resolved.map.barcode ? raw[resolved.map.barcode] : null);
    const asin = parseStringOrNull(resolved.map.asin ? raw[resolved.map.asin] : null);
    const sku = parseStringOrNull(resolved.map.sku ? raw[resolved.map.sku] : null);
    const title = parseStringOrNull(resolved.map.title ? raw[resolved.map.title] : null);
    const price = parseNumberOrNull(raw[resolved.map.price]);
    const stockQty = resolved.map.stockQty ? parseIntOrNull(raw[resolved.map.stockQty]) : null;
    const moq = resolved.map.moq ? parseIntOrNull(raw[resolved.map.moq]) : null;
    const leadTimeDays = resolved.map.leadTimeDays ? parseIntOrNull(raw[resolved.map.leadTimeDays]) : null;
    const casePack = resolved.map.casePack ? parseIntOrNull(raw[resolved.map.casePack]) : null;

    if (!barcode && !asin && !sku) {
      rows.push({ rowNumber, status: "ERROR", error: "Row has no barcode, ASIN, or SKU to match on." });
      errors++;
      continue;
    }
    if (price === null || price < 0) {
      rows.push({ rowNumber, status: "ERROR", barcode, asin, sku, error: "Missing or invalid price." });
      errors++;
      continue;
    }

    const match = await matchProduct(client, {
      barcode,
      asin,
      amazonSku: sku,
      oaSku: sku,
      supplierSku: sku,
      title,
    });

    if (!match.productId) {
      await client.matchingQueue.create({
        data: {
          candidateType: "supplier_upload",
          rawIdentifier: barcode ?? asin ?? sku,
          rawTitle: title,
          confidence: "LOW",
          metadata: JSON.parse(
            JSON.stringify({ supplierId, price, stockQty, moq, leadTimeDays, casePack, importJobId: job.id, barcode, asin, sku })
          ),
        },
      });
      rows.push({ rowNumber, status: "UNMATCHED", barcode, asin, sku, price, productTitle: title ?? undefined });
      unmatched++;
      continue;
    }

    affectedProductIds.add(match.productId);
    const product = await client.product.findUnique({ where: { id: match.productId }, select: { title: true } });

    const existing = await client.supplierProduct.findUnique({
      where: { supplierId_productId: { supplierId, productId: match.productId } },
    });

    if (!existing) {
      const created_ = await client.supplierProduct.create({
        data: {
          supplierId,
          productId: match.productId,
          supplierSku: sku ?? undefined,
          price,
          stockQty: stockQty ?? undefined,
          moq: moq ?? undefined,
          casePack: casePack ?? undefined,
          leadTimeDays: leadTimeDays ?? undefined,
        },
      });
      await client.supplierPriceHistory.create({
        data: { supplierProductId: created_.id, price, source: "manual_upload", importJobId: job.id },
      });
      rows.push({ rowNumber, status: "CREATED", productId: match.productId, productTitle: product?.title, barcode, asin, sku, price, priceDirection: "NEW" });
      created++;
      continue;
    }

    const previousPrice = Number(existing.price);
    const priceChanged = Math.abs(previousPrice - price) > PRICE_EPSILON;

    await client.supplierProduct.update({
      where: { id: existing.id },
      data: {
        supplierSku: sku ?? existing.supplierSku,
        price,
        stockQty: stockQty ?? existing.stockQty,
        moq: moq ?? existing.moq,
        casePack: casePack ?? existing.casePack,
        leadTimeDays: leadTimeDays ?? existing.leadTimeDays,
        lastUpdated: new Date(),
        isActive: true,
      },
    });

    if (priceChanged) {
      await client.supplierPriceHistory.create({
        data: { supplierProductId: existing.id, price, source: "manual_upload", importJobId: job.id },
      });

      const increased = price > previousPrice;
      const pct = previousPrice ? ((price - previousPrice) / previousPrice) * 100 : null;
      await client.alert.create({
        data: {
          productId: match.productId,
          type: increased ? "SUPPLIER_PRICE_INCREASED" : "SUPPLIER_PRICE_DROPPED",
          severity: increased ? "WARNING" : "INFO",
          status: "OPEN",
          message: `${supplierName}'s price for ${product?.title ?? "this product"} ${increased ? "increased" : "dropped"} from ${previousPrice.toFixed(2)} to ${price.toFixed(2)}${pct != null ? ` (${pct > 0 ? "+" : ""}${pct.toFixed(1)}%)` : ""}.`,
          metadata: { supplierId, previousPrice, price, importJobId: job.id },
        },
      });

      rows.push({
        rowNumber,
        status: "UPDATED",
        productId: match.productId,
        productTitle: product?.title,
        barcode,
        asin,
        sku,
        price,
        previousPrice,
        priceDirection: price > previousPrice ? "INCREASED" : "DECREASED",
      });
      updated++;
    } else {
      rows.push({
        rowNumber,
        status: "UNCHANGED",
        productId: match.productId,
        productTitle: product?.title,
        barcode,
        asin,
        sku,
        price,
        previousPrice,
        priceDirection: "UNCHANGED",
      });
      unchanged++;
    }
  }

  const status = errors > 0 && created + updated + unchanged === 0 ? "FAILED" : errors > 0 ? "PARTIAL" : "SUCCEEDED";

  await client.importJob.update({
    where: { id: job.id },
    data: {
      status: status as never,
      finishedAt: new Date(),
      rowsRead: sheet.rows.length,
      rowsCreated: created,
      rowsUpdated: updated,
      rowsSkipped: unchanged,
      errorCount: errors,
      priceChanges: created + updated,
      unmatchedProducts: unmatched,
      summary: JSON.parse(JSON.stringify({ rows: rows.slice(0, 500) })),
    },
  });

  return {
    importJobId: job.id,
    rowsRead: sheet.rows.length,
    created,
    updated,
    unchanged,
    unmatched,
    errors,
    affectedProductIds: [...affectedProductIds],
    rows,
    mappingIssue: null,
  };
}
