import type { PrismaClient } from "@prisma/client";
import { SheetData } from "../sheet-reader";
import { ResolvedColumnMap, extractRow } from "../header-mapping";
import { parseDateOrNull, parseIntOrNull, parseStringOrNull } from "../value-parsers";
import { matchProduct } from "../../matching/match-product";
import { normalizeBarcode } from "../../matching/normalize";
import { stockOutFingerprint } from "../fingerprint";
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

/** Imports "Stock_OUT" (spec section 2): immutable outgoing-movement history. */
export async function importStockOut(
  client: PrismaClient,
  sheet: SheetData,
  columnMap: ResolvedColumnMap["map"],
  importJobId: string
): Promise<ImportCounters & { newStockOutTxns: number }> {
  const counters = { ...emptyCounters(), newStockOutTxns: 0 };

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
      const qty = parseIntOrNull(raw.qtyOut);
      const shipmentReference = parseStringOrNull(raw.shipmentReference);
      const brand = parseStringOrNull(raw.brand);
      const title = parseStringOrNull(raw.productTitle);
      const fcDestination = parseStringOrNull(raw.fcDestination);

      if (!date || !barcode || qty == null) {
        counters.rowsSkipped++;
        counters.rowErrors.push({ rowNumber, message: "Missing required field (date/barcode/qty)" });
        continue;
      }

      const fingerprint = stockOutFingerprint({ date, barcode, qty, shipmentReference });
      const already = await client.inventoryTransaction.findUnique({ where: { fingerprint } });
      if (already) {
        counters.rowsSkipped++;
        continue;
      }

      const match = await matchProduct(client, { barcode });
      let productId = match.productId;

      if (!productId) {
        counters.unmatchedProducts++;
        await client.matchingQueue.create({
          data: {
            candidateType: "stock_out_import",
            rawIdentifier: barcode,
            rawTitle: title,
            rawBrand: brand,
            confidence: "LOW",
            metadata: { importJobId, rowNumber, shipmentReference },
          },
        });
        counters.rowsSkipped++;
        continue;
      }

      await client.$transaction(async (tx) => {
        await tx.inventoryTransaction.create({
          data: {
            productId: productId!,
            locationId: roverLocation.id,
            direction: "OUT",
            sourceType: "STOCK_OUT",
            qty,
            transactionDate: date,
            shipmentReference,
            fcDestination,
            brand,
            productTitleRaw: title,
            barcodeRaw: barcode,
            fingerprint,
            importJobId,
          },
        });

        const bal = await tx.inventoryBalance.upsert({
          where: { productId_locationId: { productId: productId!, locationId: roverLocation.id } },
          create: { productId: productId!, locationId: roverLocation.id, qty: -qty },
          update: { qty: { decrement: qty } },
        });

        await tx.product.update({ where: { id: productId! }, data: { roverQty: bal.qty } });

        if (bal.qty < 0) {
          await tx.alert.create({
            data: {
              type: "NEGATIVE_WAREHOUSE_STOCK",
              severity: "CRITICAL",
              productId: productId!,
              message: `Stock_OUT drove Rover balance negative (${bal.qty}) at row ${rowNumber}${shipmentReference ? ` (shipment ${shipmentReference})` : ""}`,
            },
          });
        }
      });

      counters.newStockOutTxns++;
      counters.rowsCreated++;
      counters.stockChanges++;
    } catch (err) {
      counters.errorCount++;
      counters.rowErrors.push({ rowNumber, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return counters;
}
