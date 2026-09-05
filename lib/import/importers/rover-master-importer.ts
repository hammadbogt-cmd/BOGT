import type { PrismaClient } from "@prisma/client";
import { SheetData } from "../sheet-reader";
import { ResolvedColumnMap, extractRow } from "../header-mapping";
import { parseIntOrNull, parseNumberOrNull, parseStringOrNull } from "../value-parsers";
import { matchProduct, registerIdentifier } from "../../matching/match-product";
import { normalizeAsin, normalizeBarcode, normalizeSku } from "../../matching/normalize";
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
 * Imports "BOGT IN Rover Master Stock" — the current physical warehouse
 * balance view (spec section 2). We treat this as the *current balance*
 * source and always keep InventoryBalance/Product in sync with it, but the
 * authoritative history for how that balance was reached comes from
 * Stock_IN/Stock_OUT transactions, not from this tab (spec: "the portal
 * should preferably calculate stock from inventory transactions instead of
 * trusting only the current spreadsheet result").
 */
export async function importRoverMasterStock(
  client: PrismaClient,
  sheet: SheetData,
  columnMap: ResolvedColumnMap["map"],
  importJobId: string
): Promise<ImportCounters> {
  const counters = emptyCounters();

  const [roverLocation, officeLocation] = await Promise.all([
    client.inventoryLocation.upsert({ where: { code: "ROVER" }, create: { code: "ROVER", name: "Rover Warehouse" }, update: {} }),
    client.inventoryLocation.upsert({ where: { code: "OFFICE" }, create: { code: "OFFICE", name: "Office" }, update: {} }),
  ]);

  for (let i = 0; i < sheet.rows.length; i++) {
    const rowNumber = i + 2;
    counters.rowsRead++;
    try {
      const raw = extractRow(sheet.rows[i], columnMap);
      const barcode = normalizeBarcode(parseStringOrNull(raw.barcode));
      const asin = normalizeAsin(parseStringOrNull(raw.asin));
      const sku = normalizeSku(parseStringOrNull(raw.sku));
      const title = parseStringOrNull(raw.title);

      if (!title && !barcode && !asin && !sku) {
        counters.rowsSkipped++;
        continue;
      }

      const match = await matchProduct(client, { barcode, asin, supplierSku: sku });
      let productId = match.productId;

      const roverQty = parseIntOrNull(raw.currentStockRover) ?? 0;
      const officeQty = parseIntOrNull(raw.currentStockOffice) ?? 0;
      const shelfLocation = parseStringOrNull(raw.shelfLocation);
      const qtyPerBox = parseIntOrNull(raw.qtyPerBox);
      const totalBoxes = parseIntOrNull(raw.totalBoxes);
      const looseQty = parseIntOrNull(raw.looseOpenBox);
      const cost = parseNumberOrNull(raw.costPrice);
      const costVat = parseNumberOrNull(raw.costPriceVat);

      if (!productId) {
        const created = await client.product.create({
          data: {
            title: title ?? `Unmapped Warehouse Item ${barcode ?? sku ?? rowNumber}`,
            brand: parseStringOrNull(raw.brand),
            catalogSource: "MANUAL",
            primaryBarcode: barcode ?? undefined,
            asin: asin ?? undefined,
            supplierSku: sku ?? undefined,
            roverQty,
            officeQty,
            shelfLocation,
            qtyPerBox: qtyPerBox ?? undefined,
            totalBoxes: totalBoxes ?? undefined,
            looseQty: looseQty ?? undefined,
            currentCost: cost ?? undefined,
            currentCostWithVat: costVat ?? undefined,
          },
        });
        productId = created.id;
        counters.productsAdded++;
        counters.rowsCreated++;
        if (barcode) await registerIdentifier(client, productId, "BARCODE_PRIMARY", barcode, "rover_master");
        if (asin) await registerIdentifier(client, productId, "ASIN", asin, "rover_master");
        if (sku) await registerIdentifier(client, productId, "SUPPLIER_SKU", sku, "rover_master");
      } else {
        const existing = await client.product.findUniqueOrThrow({ where: { id: productId } });
        if (existing.roverQty !== roverQty || existing.officeQty !== officeQty) counters.stockChanges++;
        await client.product.update({
          where: { id: productId },
          data: {
            roverQty,
            officeQty,
            shelfLocation: shelfLocation ?? existing.shelfLocation,
            qtyPerBox: qtyPerBox ?? existing.qtyPerBox,
            totalBoxes: totalBoxes ?? existing.totalBoxes,
            looseQty: looseQty ?? existing.looseQty,
            currentCost: cost ?? existing.currentCost,
            currentCostWithVat: costVat ?? existing.currentCostWithVat,
          },
        });
        counters.productsUpdated++;
        counters.rowsUpdated++;
      }

      await client.inventoryBalance.upsert({
        where: { productId_locationId: { productId, locationId: roverLocation.id } },
        create: { productId, locationId: roverLocation.id, qty: roverQty },
        update: { qty: roverQty },
      });
      await client.inventoryBalance.upsert({
        where: { productId_locationId: { productId, locationId: officeLocation.id } },
        create: { productId, locationId: officeLocation.id, qty: officeQty },
        update: { qty: officeQty },
      });

      // Flag an impossible/negative balance as data quality issue rather than silently storing it.
      if (roverQty < 0 || officeQty < 0) {
        await client.alert.create({
          data: {
            type: "NEGATIVE_WAREHOUSE_STOCK",
            severity: "CRITICAL",
            productId,
            message: `Negative warehouse stock detected for row ${rowNumber} (Rover ${roverQty}, Office ${officeQty})`,
          },
        });
      }
    } catch (err) {
      counters.errorCount++;
      counters.rowErrors.push({ rowNumber, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return counters;
}
