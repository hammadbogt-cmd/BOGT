import type { PrismaClient } from "@prisma/client";
import type { SheetData } from "../sheet-reader";
import { resolveColumnMap } from "../header-mapping";
import type { TabSchema } from "../tab-schemas";
import { parseNumberOrNull, parseIntOrNull, parseStringOrNull } from "../value-parsers";
import { matchProduct } from "../../matching/match-product";
import { classifyInvoiceLine } from "../../calc/invoice";
import { getSettings } from "../../settings-store";

function f(field: string, required: boolean, ...headerAliases: string[]) {
  return { field, required, headerAliases };
}

/**
 * A supplier invoice — like a supplier price list — arrives as an arbitrary
 * spreadsheet, not one of the two canonical Google Sheets workbooks. This
 * schema is kept separate from ALL_SCHEMAS for the same reason
 * supplier-price-list-importer.ts is: it reuses header-alias resolution and
 * matchProduct(), but is never routed through runImport().
 */
export const INVOICE_SCHEMA: TabSchema = {
  targetEntity: "STOCK_IN" as never, // unused placeholder
  workbookName: "Invoice",
  tabName: "Invoice Lines",
  identityFields: ["barcode", "asin", "sku"],
  fields: [
    f("barcode", false, "Barcode", "BOGT Barcode", "EAN", "UPC", "Bar Code"),
    f("asin", false, "ASIN"),
    f("sku", false, "SKU", "Supplier SKU", "Item Code", "Item No"),
    f("title", false, "Product Name", "Title", "Description", "Item Description"),
    f("qty", true, "Qty", "Quantity", "Invoice Qty", "Qty Invoiced"),
    f("price", true, "Price", "Unit Price", "Invoice Price", "Cost", "Unit Cost"),
  ],
};

export interface InvoiceLineRowResult {
  rowNumber: number;
  matched: boolean;
  productId?: string;
  productTitle?: string;
  barcode?: string | null;
  asin?: string | null;
  sku?: string | null;
  qty: number;
  price: number;
  status: string;
  error?: string;
}

export interface InvoiceImportResult {
  invoiceId: string;
  rowsRead: number;
  matched: number;
  unmatched: number;
  errors: number;
  affectedProductIds: string[];
  rows: InvoiceLineRowResult[];
  mappingIssue: { missingRequired: string[] } | null;
}

export async function importInvoice(
  client: PrismaClient,
  params: { supplierId: string | null; invoiceNumber: string; invoiceDate: Date | null; fileName: string; fileType: "CSV" | "XLSX" },
  sheet: SheetData,
  triggeredById?: string | null
): Promise<InvoiceImportResult> {
  const resolved = resolveColumnMap(sheet.headers, INVOICE_SCHEMA);
  const hasIdentity = !!(resolved.map.barcode || resolved.map.asin || resolved.map.sku);
  const hasQty = !!resolved.map.qty;
  const hasPrice = !!resolved.map.price;

  const importJob = await client.importJob.create({
    data: {
      sourceType: params.fileType as never,
      sourceName: params.fileName,
      tabName: "Invoice",
      status: "RUNNING",
      triggeredById: triggeredById ?? undefined,
    },
  });

  const invoice = await client.invoice.create({
    data: {
      invoiceNumber: params.invoiceNumber,
      supplierId: params.supplierId ?? undefined,
      invoiceDate: params.invoiceDate ?? undefined,
      fileName: params.fileName,
      fileType: params.fileType.toLowerCase(),
      status: "MATCHING",
      importJobId: importJob.id,
    },
  });

  if (!hasIdentity || !hasQty || !hasPrice) {
    const missingRequired = [
      ...(!hasIdentity ? ["barcode/ASIN/SKU (at least one required)"] : []),
      ...(!hasQty ? ["qty"] : []),
      ...(!hasPrice ? ["price"] : []),
    ];
    await client.importJob.update({
      where: { id: importJob.id },
      data: { status: "FAILED", finishedAt: new Date(), mappingErrors: missingRequired.length, summary: { missingRequired, headersSeen: sheet.headers } },
    });
    await client.alert.create({
      data: {
        type: "SOURCE_MAPPING_ISSUE",
        severity: "CRITICAL",
        message: `${params.fileName}: missing required column(s) ${missingRequired.join(", ")}`,
        metadata: { importJobId: importJob.id, missing: missingRequired },
      },
    });
    return { invoiceId: invoice.id, rowsRead: 0, matched: 0, unmatched: 0, errors: 0, affectedProductIds: [], rows: [], mappingIssue: { missingRequired } };
  }

  const settings = await getSettings(client);
  const rows: InvoiceLineRowResult[] = [];
  const affectedProductIds = new Set<string>();
  let matched = 0;
  let unmatched = 0;
  let errors = 0;

  for (let i = 0; i < sheet.rows.length; i++) {
    const raw = sheet.rows[i];
    const rowNumber = i + 2;
    const barcode = parseStringOrNull(resolved.map.barcode ? raw[resolved.map.barcode] : null);
    const asin = parseStringOrNull(resolved.map.asin ? raw[resolved.map.asin] : null);
    const sku = parseStringOrNull(resolved.map.sku ? raw[resolved.map.sku] : null);
    const title = parseStringOrNull(resolved.map.title ? raw[resolved.map.title] : null);
    const qty = parseIntOrNull(raw[resolved.map.qty]);
    const price = parseNumberOrNull(raw[resolved.map.price]);

    if (qty == null || price == null || price < 0) {
      rows.push({ rowNumber, matched: false, barcode, asin, sku, qty: qty ?? 0, price: price ?? 0, status: "ERROR", error: "Missing or invalid qty/price." });
      errors++;
      continue;
    }

    const matchResult = !barcode && !asin && !sku ? { productId: null, matchedByBarcode: false } : await matchProduct(client, { barcode, asin, amazonSku: sku, oaSku: sku, supplierSku: sku, title });

    if (!matchResult.productId) {
      const status = barcode ? "BARCODE_NOT_MATCHED" : "UNKNOWN_PRODUCT";
      const invoiceItem = await client.invoiceItem.create({
        data: { invoiceId: invoice.id, barcodeRaw: barcode, asinRaw: asin, skuRaw: sku, titleRaw: title, invoiceQty: qty, invoicePrice: price, status: status as never },
      });
      await client.matchingQueue.create({
        data: {
          candidateType: "invoice_upload",
          rawIdentifier: barcode ?? asin ?? sku,
          rawTitle: title,
          confidence: "LOW",
          metadata: JSON.parse(JSON.stringify({ invoiceId: invoice.id, invoiceItemId: invoiceItem.id, importJobId: importJob.id, rowNumber, qty, price, barcode, asin, sku })),
        },
      });
      rows.push({ rowNumber, matched: false, barcode, asin, sku, qty, price, status });
      unmatched++;
      continue;
    }

    affectedProductIds.add(matchResult.productId);
    const product = await client.product.findUniqueOrThrow({ where: { id: matchResult.productId } });
    const activeOffers = await client.supplierProduct.findMany({ where: { productId: matchResult.productId, isActive: true } });
    const bestCurrentSupplierPrice = activeOffers.length > 0 ? Math.min(...activeOffers.map((o) => Number(o.price))) : null;
    const sellingPrice = product.ourPrice != null ? Number(product.ourPrice) : product.buyBoxPrice != null ? Number(product.buyBoxPrice) : null;

    const classified = classifyInvoiceLine(
      {
        matched: true,
        matchedByBarcode: !!barcode,
        invoicePrice: price,
        invoiceQty: qty,
        lastPurchasePrice: product.lastPurchaseCost != null ? Number(product.lastPurchaseCost) : null,
        currentMasterCost: product.currentCost != null ? Number(product.currentCost) : null,
        weightedAvgPrice: product.weightedAvgCost != null ? Number(product.weightedAvgCost) : null,
        lowestHistoricalPrice: product.lowestHistoricalCost != null ? Number(product.lowestHistoricalCost) : null,
        bestCurrentSupplierPrice,
        currentSellingPrice: sellingPrice,
        fbaFee: product.fbaFee != null ? Number(product.fbaFee) : null,
      },
      settings
    );

    if (classified.primaryStatus === "PRICE_INCREASED" || classified.primaryStatus === "LARGE_PRICE_INCREASE") {
      await client.alert.create({
        data: {
          productId: matchResult.productId,
          type: "INVOICE_PRICE_INCREASED",
          severity: classified.primaryStatus === "LARGE_PRICE_INCREASE" ? "CRITICAL" : "WARNING",
          status: "OPEN",
          message: `Invoice ${params.invoiceNumber}: ${product.title} billed at ${price.toFixed(2)} vs reference ${classified.referencePriceUsed?.toFixed(2) ?? "?"} (${classified.priceDiffPct != null ? `${(classified.priceDiffPct * 100).toFixed(1)}%` : "?"} increase).`,
          metadata: { invoiceId: invoice.id, invoicePrice: price, referencePrice: classified.referencePriceUsed },
        },
      });
    }

    await client.invoiceItem.create({
      data: {
        invoiceId: invoice.id,
        productId: matchResult.productId,
        barcodeRaw: barcode,
        asinRaw: asin,
        skuRaw: sku,
        titleRaw: title,
        invoiceQty: qty,
        invoicePrice: price,
        lastPurchasePrice: product.lastPurchaseCost ?? undefined,
        weightedAvgPrice: product.weightedAvgCost ?? undefined,
        lowestHistoricalPrice: product.lowestHistoricalCost ?? undefined,
        currentMasterCost: product.currentCost ?? undefined,
        bestCurrentSupplierPrice: bestCurrentSupplierPrice ?? undefined,
        priceDiff: classified.priceDiff ?? undefined,
        priceDiffPct: classified.priceDiffPct ?? undefined,
        currentSellingPrice: sellingPrice ?? undefined,
        estFbaFee: product.fbaFee ?? undefined,
        profit: classified.profit ?? undefined,
        roiPct: classified.roiPct ?? undefined,
        status: classified.primaryStatus as never,
      },
    });

    rows.push({
      rowNumber,
      matched: true,
      productId: matchResult.productId,
      productTitle: product.title,
      barcode,
      asin,
      sku,
      qty,
      price,
      status: classified.primaryStatus,
    });
    matched++;
  }

  const status = errors > 0 && matched + unmatched === 0 ? "FAILED" : "SUCCEEDED";
  await client.importJob.update({
    where: { id: importJob.id },
    data: {
      status: status as never,
      finishedAt: new Date(),
      rowsRead: sheet.rows.length,
      rowsCreated: matched,
      errorCount: errors,
      unmatchedProducts: unmatched,
      summary: JSON.parse(JSON.stringify({ rows: rows.slice(0, 500) })),
    },
  });

  await client.invoice.update({ where: { id: invoice.id }, data: { status: "REVIEWED" } });

  return {
    invoiceId: invoice.id,
    rowsRead: sheet.rows.length,
    matched,
    unmatched,
    errors,
    affectedProductIds: [...affectedProductIds],
    rows,
    mappingIssue: null,
  };
}
