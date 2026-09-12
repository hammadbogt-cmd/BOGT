import type { PrismaClient } from "@prisma/client";
import { SheetData } from "../sheet-reader";
import { ResolvedColumnMap, extractRow } from "../header-mapping";
import { parseIntOrNull, parseNumberOrNull, parseStringOrNull } from "../value-parsers";
import { normalizeAsin, normalizeBarcode, normalizeSku } from "../../matching/normalize";
import { IdentityIndex, recordIdentifierConflicts } from "../../matching/identity-index";
import { bulkUpdateById, bulkUpsert, newId, type BulkColumn } from "../bulk";

export interface ImportCounters {
  rowsRead: number;
  rowsCreated: number;
  rowsUpdated: number;
  rowsSkipped: number;
  errorCount: number;
  productsAdded: number;
  productsUpdated: number;
  priceChanges: number;
  stockChanges: number;
  unmatchedProducts: number;
  rowErrors: { rowNumber: number; message: string }[];
  /** Ids of every product this import touched, so only those need recomputing afterwards. */
  touchedProductIds?: string[];
}

function emptyCounters(): ImportCounters {
  return {
    rowsRead: 0,
    rowsCreated: 0,
    rowsUpdated: 0,
    rowsSkipped: 0,
    errorCount: 0,
    productsAdded: 0,
    productsUpdated: 0,
    priceChanges: 0,
    stockChanges: 0,
    unmatchedProducts: 0,
    rowErrors: [],
    touchedProductIds: [],
  };
}

interface ProductFields {
  brand: string | null;
  title: string;
  bsr: number | null;
  unitsShippedT30: number | null;
  lastMonthSale: number | null;
  amazonAvailableQty: number;
  amazonReservedQty: number;
  amazonInboundQty: number;
  amazonUnfulfillableQty: number;
  buyBoxPrice: number | null;
  ourPrice: number | null;
  miniPrice: number | null;
  currentCost: number | null;
  currentCostWithVat: number | null;
  fbaFee: number | null;
}

const PRODUCT_UPDATE_COLUMNS: BulkColumn[] = [
  { name: "brand", type: "text" },
  { name: "title", type: "text" },
  { name: "bsr", type: "integer" },
  { name: "unitsShippedT30", type: "integer" },
  { name: "lastMonthSale", type: "integer" },
  { name: "amazonAvailableQty", type: "integer" },
  { name: "amazonReservedQty", type: "integer" },
  { name: "amazonInboundQty", type: "integer" },
  { name: "amazonUnfulfillableQty", type: "integer" },
  { name: "buyBoxPrice", type: "numeric" },
  { name: "ourPrice", type: "numeric" },
  { name: "miniPrice", type: "numeric" },
  { name: "currentCost", type: "numeric" },
  { name: "currentCostWithVat", type: "numeric" },
  { name: "fbaFee", type: "numeric" },
  { name: "updatedAt", type: "timestamp" },
];

/**
 * Shared importer for the two Amazon operational-stats tabs (spec sections
 * 1 & 40): "All PRODUCTS STATS" (source = AMAZON_MAIN) and "OA USA Products"
 * (source = OA_USA). Both tabs enter the SAME Product Master, but their
 * catalog source, and the SKU "namespace" they belong to, are preserved
 * (spec: "Do not assume the same SKU format between these tabs").
 *
 * Runs as a BULK pass: identity and existing product state are read once up
 * front, every row is resolved in memory, and the resulting inserts/updates
 * are written in batched statements. Row-level behaviour (matching priority,
 * skip rules, duplicate-barcode protection, counters) is identical to the
 * previous row-at-a-time implementation — but a 1,600-row tab costs on the
 * order of a dozen database round trips instead of ~20,000, which is the
 * difference between a sync that finishes and one that is killed by the
 * hosting time limit.
 */
export async function importProductStats(
  client: PrismaClient,
  sheet: SheetData,
  columnMap: ResolvedColumnMap["map"],
  catalogSource: "AMAZON_MAIN" | "OA_USA",
  importJobId: string
): Promise<ImportCounters> {
  const counters = emptyCounters();
  const skuIdentifierType = catalogSource === "AMAZON_MAIN" ? "AMAZON_SKU" : "OA_SKU";
  const now = new Date();

  const index = await IdentityIndex.load(client);
  const existingProducts = new Map(
    (
      await client.product.findMany({
        select: {
          id: true,
          title: true,
          brand: true,
          buyBoxPrice: true,
          ourPrice: true,
          currentCost: true,
          amazonAvailableQty: true,
        },
      })
    ).map((p) => [p.id, p])
  );

  const productCreates: Record<string, unknown>[] = [];
  const productUpdates: Record<string, unknown>[] = [];
  const sourceMappings: Record<string, unknown>[] = [];
  const statsRows: Record<string, unknown>[] = [];
  const salesRows: Record<string, unknown>[] = [];
  const matchingQueueRows: Record<string, unknown>[] = [];
  const touched = new Set<string>();

  for (let i = 0; i < sheet.rows.length; i++) {
    const rowNumber = i + 2; // account for header row
    counters.rowsRead++;
    try {
      const raw = extractRow(sheet.rows[i], columnMap);

      const barcode = normalizeBarcode(parseStringOrNull(raw.barcode));
      const asin = normalizeAsin(parseStringOrNull(raw.asin));
      const sku = normalizeSku(parseStringOrNull(raw.sku));
      const title = parseStringOrNull(raw.title);
      const listingStatusText = parseStringOrNull(raw.listingStatus);

      if (!title) {
        counters.rowsSkipped++;
        counters.rowErrors.push({ rowNumber, message: "Missing product title/name" });
        continue;
      }

      const match = index.match({
        barcode,
        asin,
        amazonSku: catalogSource === "AMAZON_MAIN" ? sku : null,
        oaSku: catalogSource === "OA_USA" ? sku : null,
      });

      const fields: ProductFields = {
        brand: parseStringOrNull(raw.brand),
        title,
        bsr: parseIntOrNull(raw.bsr),
        unitsShippedT30: parseIntOrNull(raw.unitsShippedT30),
        lastMonthSale: parseIntOrNull(raw.lastMonthSale),
        amazonAvailableQty: parseIntOrNull(raw.availableQty) ?? 0,
        amazonReservedQty: parseIntOrNull(raw.reservedQty) ?? 0,
        amazonInboundQty: parseIntOrNull(raw.inboundQty) ?? 0,
        amazonUnfulfillableQty: parseIntOrNull(raw.unfulfillableQty) ?? 0,
        buyBoxPrice: parseNumberOrNull(raw.buyBoxPrice),
        ourPrice: parseNumberOrNull(raw.ourPrice),
        miniPrice: parseNumberOrNull(raw.miniPrice),
        currentCost: parseNumberOrNull(raw.costPrice),
        currentCostWithVat: parseNumberOrNull(raw.costPriceVat),
        fbaFee: parseNumberOrNull(raw.fbaFee),
      };

      let productId = match.productId;

      if (!productId) {
        if (!barcode && !asin && !sku) {
          // Nothing to key off at all — route to review instead of creating a ghost product.
          counters.unmatchedProducts++;
          matchingQueueRows.push({
            candidateType: "sheet_import",
            rawIdentifier: null,
            rawTitle: title,
            rawBrand: fields.brand,
            confidence: "LOW",
            metadata: { importJobId, rowNumber, reason: "NO_IDENTIFIER" },
          });
          counters.rowsSkipped++;
          continue;
        }

        productId = newId();
        productCreates.push({
          id: productId,
          ...fields,
          catalogSource,
          primaryBarcode: barcode,
          asin,
          amazonSku: catalogSource === "AMAZON_MAIN" ? sku : null,
          oaSku: catalogSource === "OA_USA" ? sku : null,
          createdAt: now,
          updatedAt: now,
        });
        // Keep in-memory state consistent for any later row that matches this same product.
        existingProducts.set(productId, {
          id: productId,
          title: fields.title,
          brand: fields.brand,
          buyBoxPrice: fields.buyBoxPrice as never,
          ourPrice: fields.ourPrice as never,
          currentCost: fields.currentCost as never,
          amazonAvailableQty: fields.amazonAvailableQty,
        });
        counters.productsAdded++;
        counters.rowsCreated++;
      } else {
        const existing = existingProducts.get(productId);
        if (!existing) throw new Error(`Matched product ${productId} is missing from the product master`);

        const priceChanged =
          numChanged(existing.buyBoxPrice, fields.buyBoxPrice) ||
          numChanged(existing.ourPrice, fields.ourPrice) ||
          numChanged(existing.currentCost, fields.currentCost);
        const stockChanged = existing.amazonAvailableQty !== fields.amazonAvailableQty;
        if (priceChanged) counters.priceChanges++;
        if (stockChanged) counters.stockChanges++;

        productUpdates.push({
          id: productId,
          ...fields,
          // Never blank out a title/brand we already had with an empty value from a partial row.
          title: title || existing.title,
          brand: fields.brand ?? existing.brand,
          updatedAt: now,
        });
        existingProducts.set(productId, {
          ...existing,
          title: title || existing.title,
          brand: fields.brand ?? existing.brand,
          buyBoxPrice: fields.buyBoxPrice as never,
          ourPrice: fields.ourPrice as never,
          currentCost: fields.currentCost as never,
          amazonAvailableQty: fields.amazonAvailableQty,
        });
        counters.productsUpdated++;
        counters.rowsUpdated++;
      }

      if (barcode) index.stage(productId, "BARCODE_PRIMARY", barcode, "sheet_import");
      if (asin) index.stage(productId, "ASIN", asin, "sheet_import");
      if (sku) index.stage(productId, skuIdentifierType, sku, "sheet_import");

      touched.add(productId);

      sourceMappings.push({
        id: newId(),
        productId,
        source: catalogSource,
        sourceSku: sku ?? `ROW_${rowNumber}`,
        createdAt: now,
      });

      statsRows.push({
        id: newId(),
        productId,
        source: catalogSource,
        effectiveDate: now,
        isCurrent: true,
        brandName: fields.brand,
        listingStatus: listingStatusText,
        bsr: fields.bsr,
        lastMonthSale: fields.lastMonthSale,
        unitsShippedT30: fields.unitsShippedT30,
        inboundQty: fields.amazonInboundQty,
        reservedQty: fields.amazonReservedQty,
        unfulfillableQty: fields.amazonUnfulfillableQty,
        availableQty: fields.amazonAvailableQty,
        availableQtyValue: parseNumberOrNull(raw.availableQtyValue),
        costPrice: fields.currentCost,
        costPriceWithVat: fields.currentCostWithVat,
        fbaFee: fields.fbaFee,
        referralFee: parseNumberOrNull(raw.referralFee),
        breakevenPrice: parseNumberOrNull(raw.breakevenPrice),
        buyBoxPrice: fields.buyBoxPrice,
        profitLoss: parseNumberOrNull(raw.profitLoss),
        profitPct: parseNumberOrNull(raw.profitPct),
        roi: parseNumberOrNull(raw.roi),
        miniPrice: fields.miniPrice,
        ourPrice: fields.ourPrice,
        importJobId,
        createdAt: now,
      });

      if (fields.unitsShippedT30 != null) {
        salesRows.push({
          id: newId(),
          productId,
          periodType: "T30",
          unitsSold: fields.unitsShippedT30,
          periodEnd: now,
          isEstimated: false,
          source: catalogSource,
          createdAt: now,
        });
      }
    } catch (err) {
      counters.errorCount++;
      counters.rowErrors.push({ rowNumber, message: err instanceof Error ? err.message : String(err) });
    }
  }

  // ---- write everything, in batches -------------------------------------
  await flushProductCreates(client, productCreates);
  await bulkUpdateById(client, "products", PRODUCT_UPDATE_COLUMNS, productUpdates);
  await index.flush(client);
  await recordIdentifierConflicts(client, index.takeConflicts());

  await bulkUpsert(
    client,
    "product_source_mappings",
    ["source", "sourceSku"],
    [
      { name: "id", type: "text" },
      { name: "productId", type: "text" },
      { name: "source", type: "text", cast: '"CatalogSource"' },
      { name: "sourceSku", type: "text" },
      { name: "createdAt", type: "timestamp" },
    ],
    dedupeBy(sourceMappings, (r) => `${r.source} ${r.sourceSku}`),
    { updateColumns: ["productId"] }
  );

  const touchedIds = [...touched];
  await supersedeCurrentStats(client, touchedIds, catalogSource);
  await insertStats(client, statsRows);
  await insertSales(client, salesRows);

  if (matchingQueueRows.length > 0) {
    await client.matchingQueue.createMany({ data: matchingQueueRows as never[] });
  }

  counters.touchedProductIds = touchedIds;
  return counters;
}

/** Later rows win, matching the previous per-row upsert behaviour. */
function dedupeBy(rows: Record<string, unknown>[], key: (row: Record<string, unknown>) => string): Record<string, unknown>[] {
  const map = new Map<string, Record<string, unknown>>();
  for (const row of rows) map.set(key(row), row);
  return [...map.values()];
}

async function flushProductCreates(client: PrismaClient, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += 500) {
    await client.product.createMany({ data: rows.slice(i, i + 500) as never[] });
  }
}

async function supersedeCurrentStats(client: PrismaClient, productIds: string[], catalogSource: string) {
  for (let i = 0; i < productIds.length; i += 1000) {
    const chunk = productIds.slice(i, i + 1000);
    await client.amazonStats.updateMany({
      where: { productId: { in: chunk }, source: catalogSource as never, isCurrent: true },
      data: { isCurrent: false },
    });
  }
}

async function insertStats(client: PrismaClient, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += 500) {
    await client.amazonStats.createMany({ data: rows.slice(i, i + 500) as never[] });
  }
}

async function insertSales(client: PrismaClient, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += 1000) {
    await client.salesHistory.createMany({ data: rows.slice(i, i + 1000) as never[] });
  }
}

function numChanged(a: unknown, b: number | null): boolean {
  const an = a === null || a === undefined ? null : Number(a);
  if (an === null && b === null) return false;
  if (an === null || b === null) return true;
  return Math.abs(an - b) > 0.0001;
}
