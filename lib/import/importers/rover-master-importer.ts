import type { PrismaClient } from "@prisma/client";
import { SheetData } from "../sheet-reader";
import { ResolvedColumnMap, extractRow } from "../header-mapping";
import { parseIntOrNull, parseNumberOrNull, parseStringOrNull } from "../value-parsers";
import { normalizeAsin, normalizeBarcode, normalizeSku } from "../../matching/normalize";
import { IdentityIndex, recordIdentifierConflicts } from "../../matching/identity-index";
import { bulkUpdateById, bulkUpsert, newId, type BulkColumn } from "../bulk";
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
    touchedProductIds: [],
  };
}

const PRODUCT_UPDATE_COLUMNS: BulkColumn[] = [
  { name: "roverQty", type: "integer" },
  { name: "officeQty", type: "integer" },
  { name: "shelfLocation", type: "text" },
  { name: "qtyPerBox", type: "integer" },
  { name: "totalBoxes", type: "integer" },
  { name: "looseQty", type: "integer" },
  { name: "currentCost", type: "numeric" },
  { name: "currentCostWithVat", type: "numeric" },
  { name: "updatedAt", type: "timestamp" },
];

/**
 * Imports "BOGT IN Rover Master Stock" — the current physical warehouse
 * balance view (spec section 2). We treat this as the *current balance*
 * source and always keep InventoryBalance/Product in sync with it, but the
 * authoritative history for how that balance was reached comes from
 * Stock_IN/Stock_OUT transactions, not from this tab (spec: "the portal
 * should preferably calculate stock from inventory transactions instead of
 * trusting only the current spreadsheet result").
 *
 * Reads identity once and writes in batches — see product-stats-importer for
 * why (thousands of sequential round trips will not fit in one request).
 */
export async function importRoverMasterStock(
  client: PrismaClient,
  sheet: SheetData,
  columnMap: ResolvedColumnMap["map"],
  importJobId: string
): Promise<ImportCounters> {
  const counters = emptyCounters();
  const now = new Date();

  const [roverLocation, officeLocation] = await Promise.all([
    client.inventoryLocation.upsert({ where: { code: "ROVER" }, create: { code: "ROVER", name: "Rover Warehouse" }, update: {} }),
    client.inventoryLocation.upsert({ where: { code: "OFFICE" }, create: { code: "OFFICE", name: "Office" }, update: {} }),
  ]);

  const index = await IdentityIndex.load(client);
  const existingProducts = new Map(
    (
      await client.product.findMany({
        select: {
          id: true,
          roverQty: true,
          officeQty: true,
          shelfLocation: true,
          qtyPerBox: true,
          totalBoxes: true,
          looseQty: true,
          currentCost: true,
          currentCostWithVat: true,
        },
      })
    ).map((p) => [p.id, p])
  );

  const productCreates: Record<string, unknown>[] = [];
  const productUpdates: Record<string, unknown>[] = [];
  const balances: Record<string, unknown>[] = [];
  const negativeAlerts: { productId: string; message: string }[] = [];
  const touched = new Set<string>();

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

      const match = index.match({ barcode, asin, supplierSku: sku });
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
        productId = newId();
        productCreates.push({
          id: productId,
          title: title ?? `Unmapped Warehouse Item ${barcode ?? sku ?? rowNumber}`,
          brand: parseStringOrNull(raw.brand),
          catalogSource: "MANUAL",
          primaryBarcode: barcode,
          asin,
          supplierSku: sku,
          roverQty,
          officeQty,
          shelfLocation,
          qtyPerBox,
          totalBoxes,
          looseQty,
          currentCost: cost,
          currentCostWithVat: costVat,
          createdAt: now,
          updatedAt: now,
        });
        existingProducts.set(productId, {
          id: productId,
          roverQty,
          officeQty,
          shelfLocation,
          qtyPerBox,
          totalBoxes,
          looseQty,
          currentCost: cost as never,
          currentCostWithVat: costVat as never,
        });
        counters.productsAdded++;
        counters.rowsCreated++;
        if (barcode) index.stage(productId, "BARCODE_PRIMARY", barcode, "rover_master");
        if (asin) index.stage(productId, "ASIN", asin, "rover_master");
        if (sku) index.stage(productId, "SUPPLIER_SKU", sku, "rover_master");
      } else {
        const existing = existingProducts.get(productId);
        if (!existing) throw new Error(`Matched product ${productId} is missing from the product master`);
        if (existing.roverQty !== roverQty || existing.officeQty !== officeQty) counters.stockChanges++;

        const next = {
          roverQty,
          officeQty,
          shelfLocation: shelfLocation ?? existing.shelfLocation,
          qtyPerBox: qtyPerBox ?? existing.qtyPerBox,
          totalBoxes: totalBoxes ?? existing.totalBoxes,
          looseQty: looseQty ?? existing.looseQty,
          currentCost: cost ?? numOrNull(existing.currentCost),
          currentCostWithVat: costVat ?? numOrNull(existing.currentCostWithVat),
        };
        productUpdates.push({ id: productId, ...next, updatedAt: now });
        existingProducts.set(productId, {
          ...existing,
          roverQty: next.roverQty,
          officeQty: next.officeQty,
          shelfLocation: next.shelfLocation,
          qtyPerBox: next.qtyPerBox,
          totalBoxes: next.totalBoxes,
          looseQty: next.looseQty,
          currentCost: next.currentCost as never,
          currentCostWithVat: next.currentCostWithVat as never,
        });
        counters.productsUpdated++;
        counters.rowsUpdated++;
      }

      touched.add(productId);

      balances.push({ id: newId(), productId, locationId: roverLocation.id, qty: roverQty, updatedAt: now });
      balances.push({ id: newId(), productId, locationId: officeLocation.id, qty: officeQty, updatedAt: now });

      // Flag an impossible/negative balance as a data quality issue rather than silently storing it.
      if (roverQty < 0 || officeQty < 0) {
        negativeAlerts.push({
          productId,
          message: `Negative warehouse stock detected for row ${rowNumber} (Rover ${roverQty}, Office ${officeQty})`,
        });
      }
    } catch (err) {
      counters.errorCount++;
      counters.rowErrors.push({ rowNumber, message: err instanceof Error ? err.message : String(err) });
    }
  }

  for (let i = 0; i < productCreates.length; i += 500) {
    await client.product.createMany({ data: productCreates.slice(i, i + 500) as never[] });
  }
  await bulkUpdateById(client, "products", PRODUCT_UPDATE_COLUMNS, productUpdates);
  await index.flush(client);
  await recordIdentifierConflicts(client, index.takeConflicts());

  await bulkUpsert(
    client,
    "inventory_balances",
    ["productId", "locationId"],
    [
      { name: "id", type: "text" },
      { name: "productId", type: "text" },
      { name: "locationId", type: "text" },
      { name: "qty", type: "integer" },
      { name: "updatedAt", type: "timestamp" },
    ],
    dedupeBy(balances, (r) => `${r.productId} ${r.locationId}`),
    { updateColumns: ["qty", "updatedAt"] }
  );

  if (negativeAlerts.length > 0) {
    await client.alert.createMany({
      data: negativeAlerts.map((a) => ({
        type: "NEGATIVE_WAREHOUSE_STOCK" as never,
        severity: "CRITICAL" as never,
        productId: a.productId,
        message: a.message,
      })),
    });
  }

  void importJobId;
  counters.touchedProductIds = [...touched];
  return counters;
}

function dedupeBy(rows: Record<string, unknown>[], key: (row: Record<string, unknown>) => string): Record<string, unknown>[] {
  const map = new Map<string, Record<string, unknown>>();
  for (const row of rows) map.set(key(row), row);
  return [...map.values()];
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "object" && v !== null && "toNumber" in (v as never) ? (v as { toNumber: () => number }).toNumber() : Number(v);
  return Number.isFinite(n) ? n : null;
}
