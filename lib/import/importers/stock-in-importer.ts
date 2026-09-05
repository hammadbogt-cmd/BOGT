import type { PrismaClient } from "@prisma/client";
import { SheetData } from "../sheet-reader";
import { ResolvedColumnMap, extractRow } from "../header-mapping";
import { parseDateOrNull, parseIntOrNull, parseNumberOrNull, parseStringOrNull } from "../value-parsers";
import { matchProduct } from "../../matching/match-product";
import { normalizeBarcode } from "../../matching/normalize";
import { stockInFingerprint } from "../fingerprint";
import type { ImportCounters } from "./product-stats-importer";

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
 * Imports "Stock_IN" (spec section 2): builds the immutable purchase /
 * receiving history. Every row becomes an InventoryTransaction keyed by a
 * content fingerprint, so re-importing (or re-syncing from Google Sheets)
 * the same rows never creates duplicates — "Never overwrite old purchase
 * prices" and "clicking Sync multiple times must NOT duplicate data".
 */
export async function importStockIn(
  client: PrismaClient,
  sheet: SheetData,
  columnMap: ResolvedColumnMap["map"],
  importJobId: string
): Promise<ImportCounters & { newStockInTxns: number }> {
  const counters = { ...emptyCounters(), newStockInTxns: 0 };

  const roverLocation = await client.inventoryLocation.upsert({
    where: { code: "ROVER" },
    create: { code: "ROVER", name: "Rover Warehouse" },
    update: {},
  });

  for (let i = 0; i < sheet.rows.length; i++) {
    const rowNumber = i + 2;
    counters.rowsRead++;
    try {
      const raw = extractRow(sheet.rows[i], columnMap);
      const date = parseDateOrNull(raw.date);
      const barcode = normalizeBarcode(parseStringOrNull(raw.barcode));
      const qty = parseIntOrNull(raw.qtyIn);
      const invoiceId = parseStringOrNull(raw.invoiceId);
      const newCost = parseNumberOrNull(raw.newCostPrice);
      const oldCost = parseNumberOrNull(raw.oldCostPrice);
      const brand = parseStringOrNull(raw.brand);
      const title = parseStringOrNull(raw.productTitle);
      const supplierName = parseStringOrNull(raw.supplierName);

      if (!date || !barcode || qty == null) {
        counters.rowsSkipped++;
        counters.rowErrors.push({ rowNumber, message: "Missing required field (date/barcode/qty)" });
        continue;
      }

      const fingerprint = stockInFingerprint({ date, invoiceId, barcode, qty });
      const already = await client.inventoryTransaction.findUnique({ where: { fingerprint } });
      if (already) {
        counters.rowsSkipped++;
        continue; // idempotent: this exact event was already recorded
      }

      const match = await matchProduct(client, { barcode });
      let productId = match.productId;

      if (!productId) {
        counters.unmatchedProducts++;
        await client.matchingQueue.create({
          data: {
            candidateType: "stock_in_import",
            rawIdentifier: barcode,
            rawTitle: title,
            rawBrand: brand,
            confidence: "LOW",
            metadata: { importJobId, rowNumber, invoiceId },
          },
        });
        counters.rowsSkipped++;
        continue;
      }

      let supplierId: string | null = null;
      if (supplierName) {
        const supplier = await client.supplier.upsert({
          where: { name: supplierName },
          create: { name: supplierName },
          update: {},
        });
        supplierId = supplier.id;
      }

      await client.$transaction(async (tx) => {
        await tx.inventoryTransaction.create({
          data: {
            productId: productId!,
            locationId: roverLocation.id,
            direction: "IN",
            sourceType: "STOCK_IN",
            qty,
            transactionDate: date,
            invoiceId,
            newCostPrice: newCost ?? undefined,
            oldCostPrice: oldCost ?? undefined,
            brand,
            productTitleRaw: title,
            barcodeRaw: barcode,
            fingerprint,
            supplierId: supplierId ?? undefined,
            importJobId,
          },
        });

        const product = await tx.product.findUniqueOrThrow({ where: { id: productId! } });
        const priceDiff = newCost != null && oldCost != null ? newCost - oldCost : null;
        const priceDiffPct = priceDiff != null && oldCost ? priceDiff / oldCost : null;

        await tx.purchaseHistory.create({
          data: {
            productId: productId!,
            transactionId: fingerprint,
            date,
            invoiceId,
            supplierId: supplierId ?? undefined,
            supplierName,
            barcodeRaw: barcode,
            qty,
            newCost: newCost ?? product.currentCost ?? 0,
            previousCost: oldCost ?? undefined,
            priceDiff: priceDiff ?? undefined,
            priceDiffPct: priceDiffPct ?? undefined,
            source: "stock_in_import",
            importJobId,
          },
        });

        const bal = await tx.inventoryBalance.upsert({
          where: { productId_locationId: { productId: productId!, locationId: roverLocation.id } },
          create: { productId: productId!, locationId: roverLocation.id, qty },
          update: { qty: { increment: qty } },
        });

        const newLowest =
          product.lowestHistoricalCost == null || (newCost != null && newCost < Number(product.lowestHistoricalCost))
            ? newCost ?? product.lowestHistoricalCost
            : product.lowestHistoricalCost;
        const newHighest =
          product.highestHistoricalCost == null || (newCost != null && newCost > Number(product.highestHistoricalCost))
            ? newCost ?? product.highestHistoricalCost
            : product.highestHistoricalCost;

        const priorQty = product.lifetimePurchasedQty;
        const priorAvg = product.weightedAvgCost != null ? Number(product.weightedAvgCost) : newCost ?? 0;
        const newWeightedAvg =
          newCost != null ? (priorAvg * priorQty + newCost * qty) / (priorQty + qty || 1) : priorAvg;

        await tx.product.update({
          where: { id: productId! },
          data: {
            roverQty: bal.qty,
            currentCost: newCost ?? product.currentCost,
            lastPurchaseCost: newCost ?? product.lastPurchaseCost,
            lastPurchaseDate: date,
            firstPurchaseDate: product.firstPurchaseDate ?? date,
            weightedAvgCost: newWeightedAvg,
            lowestHistoricalCost: newLowest ?? undefined,
            highestHistoricalCost: newHighest ?? undefined,
            purchaseCount: { increment: 1 },
            lifetimePurchasedQty: { increment: qty },
          },
        });
      });

      counters.newStockInTxns++;
      counters.rowsCreated++;
      counters.stockChanges++;
    } catch (err) {
      counters.errorCount++;
      counters.rowErrors.push({ rowNumber, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return counters;
}
