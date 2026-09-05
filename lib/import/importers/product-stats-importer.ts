import type { PrismaClient } from "@prisma/client";
import { SheetData } from "../sheet-reader";
import { ResolvedColumnMap, extractRow } from "../header-mapping";
import { parseIntOrNull, parseNumberOrNull, parseStringOrNull } from "../value-parsers";
import { matchProduct, registerIdentifier } from "../../matching/match-product";
import { normalizeAsin, normalizeBarcode, normalizeSku } from "../../matching/normalize";

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
  };
}

/**
 * Shared importer for the two Amazon operational-stats tabs (spec sections
 * 1 & 40): "All PRODUCTS STATS" (source = AMAZON_MAIN) and "OA USA Products"
 * (source = OA_USA). Both tabs enter the SAME Product Master, but their
 * catalog source, and the SKU "namespace" they belong to, are preserved
 * (spec: "Do not assume the same SKU format between these tabs").
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

  for (let i = 0; i < sheet.rows.length; i++) {
    const rowNumber = i + 2; // account for header row
    counters.rowsRead++;
    try {
      const raw = extractRow(sheet.rows[i], columnMap);

      const barcode = normalizeBarcode(parseStringOrNull(raw.barcode));
      const asin = normalizeAsin(parseStringOrNull(raw.asin));
      const sku = normalizeSku(parseStringOrNull(raw.sku));
      const title = parseStringOrNull(raw.title);

      if (!title) {
        counters.rowsSkipped++;
        counters.rowErrors.push({ rowNumber, message: "Missing product title/name" });
        continue;
      }

      const match = await matchProduct(client, {
        barcode,
        asin,
        amazonSku: catalogSource === "AMAZON_MAIN" ? sku : null,
        oaSku: catalogSource === "OA_USA" ? sku : null,
      });

      const fields = {
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
      let isNewProduct = false;

      if (!productId) {
        if (!barcode && !asin && !sku) {
          // Nothing to key off at all — route to review instead of creating a ghost product.
          counters.unmatchedProducts++;
          await client.matchingQueue.create({
            data: {
              candidateType: "sheet_import",
              rawIdentifier: null,
              rawTitle: title,
              rawBrand: fields.brand,
              confidence: "LOW",
              metadata: { importJobId, rowNumber, reason: "NO_IDENTIFIER" },
            },
          });
          counters.rowsSkipped++;
          continue;
        }

        const created = await client.product.create({
          data: {
            ...fields,
            catalogSource: catalogSource as never,
            primaryBarcode: barcode ?? undefined,
            asin: asin ?? undefined,
            amazonSku: catalogSource === "AMAZON_MAIN" ? sku ?? undefined : undefined,
            oaSku: catalogSource === "OA_USA" ? sku ?? undefined : undefined,
          },
        });
        productId = created.id;
        isNewProduct = true;
        counters.productsAdded++;
        counters.rowsCreated++;

        if (barcode) await registerIdentifier(client, productId, "BARCODE_PRIMARY", barcode, "sheet_import");
        if (asin) await registerIdentifier(client, productId, "ASIN", asin, "sheet_import");
        if (sku) await registerIdentifier(client, productId, skuIdentifierType, sku, "sheet_import");
      } else {
        const existing = await client.product.findUniqueOrThrow({ where: { id: productId } });

        const priceChanged =
          numChanged(existing.buyBoxPrice, fields.buyBoxPrice) ||
          numChanged(existing.ourPrice, fields.ourPrice) ||
          numChanged(existing.currentCost, fields.currentCost);
        const stockChanged = existing.amazonAvailableQty !== fields.amazonAvailableQty;
        if (priceChanged) counters.priceChanges++;
        if (stockChanged) counters.stockChanges++;

        await client.product.update({
          where: { id: productId },
          data: {
            ...fields,
            // Never blank out a title/brand we already had with an empty value from a partial row.
            title: title || existing.title,
            brand: fields.brand ?? existing.brand,
          },
        });
        counters.productsUpdated++;
        counters.rowsUpdated++;

        if (barcode) await registerIdentifier(client, productId, "BARCODE_PRIMARY", barcode, "sheet_import");
        if (asin) await registerIdentifier(client, productId, "ASIN", asin, "sheet_import");
        if (sku) await registerIdentifier(client, productId, skuIdentifierType, sku, "sheet_import");
      }

      await client.productSourceMapping.upsert({
        where: { source_sourceSku: { source: catalogSource as never, sourceSku: sku ?? `ROW_${rowNumber}` } },
        create: { productId, source: catalogSource as never, sourceSku: sku ?? `ROW_${rowNumber}` },
        update: { productId },
      });

      await client.amazonStats.updateMany({ where: { productId, source: catalogSource as never, isCurrent: true }, data: { isCurrent: false } });
      await client.amazonStats.create({
        data: {
          productId,
          source: catalogSource as never,
          isCurrent: true,
          brandName: fields.brand,
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
        },
      });

      if (fields.unitsShippedT30 != null) {
        await client.salesHistory.create({
          data: { productId, periodType: "T30", unitsSold: fields.unitsShippedT30, periodEnd: new Date(), source: catalogSource },
        });
      }

      if (!isNewProduct === false) {
        // no-op branch kept for clarity; counters already incremented above
      }
    } catch (err) {
      counters.errorCount++;
      counters.rowErrors.push({ rowNumber, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return counters;
}

function numChanged(a: unknown, b: number | null): boolean {
  const an = a === null || a === undefined ? null : Number(a);
  if (an === null && b === null) return false;
  if (an === null || b === null) return true;
  return Math.abs(an - b) > 0.0001;
}
