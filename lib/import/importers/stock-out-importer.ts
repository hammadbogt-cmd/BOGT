import type { PrismaClient } from "@prisma/client";
import { SheetData } from "../sheet-reader";
import { ResolvedColumnMap, extractRow } from "../header-mapping";
import { parseDateOrNull, parseIntOrNull, parseStringOrNull } from "../value-parsers";
import { normalizeBarcode } from "../../matching/normalize";
import { IdentityIndex } from "../../matching/identity-index";
import { stockOutFingerprint } from "../fingerprint";
import { bulkUpdateById, bulkUpsert, newId } from "../bulk";
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

/**
 * Imports "Stock_OUT" (spec section 2): outbound shipments to Amazon FCs.
 * Each row becomes an immutable OUT transaction with a content fingerprint,
 * so re-syncing the same rows never double-counts. Balances are carried
 * forward in memory in row order and written once at the end, so a long
 * shipment history does not turn into thousands of round trips.
 */
export async function importStockOut(
  client: PrismaClient,
  sheet: SheetData,
  columnMap: ResolvedColumnMap["map"],
  importJobId: string
): Promise<ImportCounters & { newStockOutTxns: number }> {
  const counters = { ...emptyCounters(), newStockOutTxns: 0 };
  const now = new Date();

  const roverLocation = await client.inventoryLocation.upsert({
    where: { code: "ROVER" },
    create: { code: "ROVER", name: "Rover Warehouse" },
    update: {},
  });

  interface ParsedRow {
    rowNumber: number;
    date: Date;
    barcode: string;
    qty: number;
    shipmentReference: string | null;
    brand: string | null;
    title: string | null;
    fcDestination: string | null;
    fingerprint: string;
  }
  const parsed: ParsedRow[] = [];

  for (let i = 0; i < sheet.rows.length; i++) {
    const rowNumber = i + 2;
    counters.rowsRead++;
    try {
      const raw = extractRow(sheet.rows[i], columnMap);
      const date = parseDateOrNull(raw.date);
      const barcode = normalizeBarcode(parseStringOrNull(raw.barcode));
      const qty = parseIntOrNull(raw.qtyOut);
      const shipmentReference = parseStringOrNull(raw.shipmentReference);

      if (!date || !barcode || qty == null) {
        counters.rowsSkipped++;
        counters.rowErrors.push({ rowNumber, message: "Missing required field (date/barcode/qty)" });
        continue;
      }

      parsed.push({
        rowNumber,
        date,
        barcode,
        qty,
        shipmentReference,
        brand: parseStringOrNull(raw.brand),
        title: parseStringOrNull(raw.productTitle),
        fcDestination: parseStringOrNull(raw.fcDestination),
        fingerprint: stockOutFingerprint({ date, barcode, qty, shipmentReference }),
      });
    } catch (err) {
      counters.errorCount++;
      counters.rowErrors.push({ rowNumber, message: err instanceof Error ? err.message : String(err) });
    }
  }

  if (parsed.length === 0) return counters;

  const seen = new Set<string>();
  for (let i = 0; i < parsed.length; i += 1000) {
    const rows = await client.inventoryTransaction.findMany({
      where: { fingerprint: { in: parsed.slice(i, i + 1000).map((p) => p.fingerprint) } },
      select: { fingerprint: true },
    });
    for (const r of rows) seen.add(r.fingerprint);
  }
  const fresh = parsed.filter((p) => !seen.has(p.fingerprint));
  counters.rowsSkipped += parsed.length - fresh.length;
  if (fresh.length === 0) return counters;

  const index = await IdentityIndex.load(client);
  const rowProductIds = new Map<number, string>();
  const matchedIds = new Set<string>();
  const queueRows: Record<string, unknown>[] = [];

  for (const row of fresh) {
    const productId = index.match({ barcode: row.barcode }).productId;
    if (!productId) {
      counters.unmatchedProducts++;
      counters.rowsSkipped++;
      queueRows.push({
        candidateType: "stock_out_import",
        rawIdentifier: row.barcode,
        rawTitle: row.title,
        rawBrand: row.brand,
        confidence: "LOW",
        metadata: { importJobId, rowNumber: row.rowNumber, shipmentReference: row.shipmentReference },
      });
      continue;
    }
    rowProductIds.set(row.rowNumber, productId);
    matchedIds.add(productId);
  }

  if (queueRows.length > 0) await client.matchingQueue.createMany({ data: queueRows as never[] });
  if (matchedIds.size === 0) return counters;

  const balances = new Map<string, number>();
  const productIds = [...matchedIds];
  for (let i = 0; i < productIds.length; i += 1000) {
    const rows = await client.inventoryBalance.findMany({
      where: { locationId: roverLocation.id, productId: { in: productIds.slice(i, i + 1000) } },
      select: { productId: true, qty: true },
    });
    for (const r of rows) balances.set(r.productId, r.qty);
  }

  const txns: Record<string, unknown>[] = [];
  const negativeAlerts: { productId: string; message: string }[] = [];

  for (const row of fresh) {
    const productId = rowProductIds.get(row.rowNumber);
    if (!productId) continue;

    txns.push({
      id: newId(),
      productId,
      locationId: roverLocation.id,
      direction: "OUT",
      sourceType: "STOCK_OUT",
      qty: row.qty,
      transactionDate: row.date,
      shipmentReference: row.shipmentReference,
      fcDestination: row.fcDestination,
      brand: row.brand,
      productTitleRaw: row.title,
      barcodeRaw: row.barcode,
      fingerprint: row.fingerprint,
      importJobId,
      createdAt: now,
    });

    const balance = (balances.get(productId) ?? 0) - row.qty;
    balances.set(productId, balance);

    if (balance < 0) {
      negativeAlerts.push({
        productId,
        message: `Stock_OUT drove Rover balance negative (${balance}) at row ${row.rowNumber}${
          row.shipmentReference ? ` (shipment ${row.shipmentReference})` : ""
        }`,
      });
    }

    counters.newStockOutTxns++;
    counters.rowsCreated++;
    counters.stockChanges++;
  }

  for (let i = 0; i < txns.length; i += 500) {
    await client.inventoryTransaction.createMany({ data: txns.slice(i, i + 500) as never[], skipDuplicates: true });
  }

  const balanceRows = [...balances.entries()].map(([productId, qty]) => ({
    id: newId(),
    productId,
    locationId: roverLocation.id,
    qty,
    updatedAt: now,
  }));
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
    balanceRows,
    { updateColumns: ["qty", "updatedAt"] }
  );

  await bulkUpdateById(
    client,
    "products",
    [
      { name: "roverQty", type: "integer" },
      { name: "updatedAt", type: "timestamp" },
    ],
    balanceRows.map((b) => ({ id: b.productId, roverQty: b.qty, updatedAt: now }))
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

  counters.touchedProductIds = productIds;
  return counters;
}
