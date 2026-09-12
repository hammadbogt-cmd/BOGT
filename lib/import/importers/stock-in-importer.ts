import type { PrismaClient } from "@prisma/client";
import { SheetData } from "../sheet-reader";
import { ResolvedColumnMap, extractRow } from "../header-mapping";
import { parseDateOrNull, parseIntOrNull, parseNumberOrNull, parseStringOrNull } from "../value-parsers";
import { normalizeBarcode } from "../../matching/normalize";
import { IdentityIndex } from "../../matching/identity-index";
import { stockInFingerprint } from "../fingerprint";
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

const PRODUCT_COLUMNS: BulkColumn[] = [
  { name: "roverQty", type: "integer" },
  { name: "currentCost", type: "numeric" },
  { name: "lastPurchaseCost", type: "numeric" },
  { name: "lastPurchaseDate", type: "timestamp" },
  { name: "firstPurchaseDate", type: "timestamp" },
  { name: "weightedAvgCost", type: "numeric" },
  { name: "lowestHistoricalCost", type: "numeric" },
  { name: "highestHistoricalCost", type: "numeric" },
  { name: "purchaseCount", type: "integer" },
  { name: "lifetimePurchasedQty", type: "integer" },
  { name: "updatedAt", type: "timestamp" },
];

interface RunningProductState {
  roverQty: number;
  currentCost: number | null;
  lastPurchaseCost: number | null;
  lastPurchaseDate: Date | null;
  firstPurchaseDate: Date | null;
  weightedAvgCost: number | null;
  lowestHistoricalCost: number | null;
  highestHistoricalCost: number | null;
  purchaseCount: number;
  lifetimePurchasedQty: number;
}

/**
 * Imports "Stock_IN" (spec section 2): builds the immutable purchase /
 * receiving history. Every row becomes an InventoryTransaction keyed by a
 * content fingerprint, so re-importing (or re-syncing from Google Sheets)
 * the same rows never creates duplicates — "Never overwrite old purchase
 * prices" and "clicking Sync multiple times must NOT duplicate data".
 *
 * Existing fingerprints, product identity and product state are read once up
 * front; rolling cost/quantity maths is then carried forward in memory in
 * exactly the original row order, and the results are written in batches.
 * Repeat syncs — where nearly every row is already recorded — cost a couple
 * of queries instead of one per row.
 */
export async function importStockIn(
  client: PrismaClient,
  sheet: SheetData,
  columnMap: ResolvedColumnMap["map"],
  importJobId: string
): Promise<ImportCounters & { newStockInTxns: number }> {
  const counters = { ...emptyCounters(), newStockInTxns: 0 };
  const now = new Date();

  const roverLocation = await client.inventoryLocation.upsert({
    where: { code: "ROVER" },
    create: { code: "ROVER", name: "Rover Warehouse" },
    update: {},
  });

  // ---- pass 1: parse every row, in order --------------------------------
  interface ParsedRow {
    rowNumber: number;
    date: Date;
    barcode: string;
    qty: number;
    invoiceId: string | null;
    newCost: number | null;
    oldCost: number | null;
    brand: string | null;
    title: string | null;
    supplierName: string | null;
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
      const qty = parseIntOrNull(raw.qtyIn);
      const invoiceId = parseStringOrNull(raw.invoiceId);

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
        invoiceId,
        newCost: parseNumberOrNull(raw.newCostPrice),
        oldCost: parseNumberOrNull(raw.oldCostPrice),
        brand: parseStringOrNull(raw.brand),
        title: parseStringOrNull(raw.productTitle),
        supplierName: parseStringOrNull(raw.supplierName),
        fingerprint: stockInFingerprint({ date, invoiceId, barcode, qty }),
      });
    } catch (err) {
      counters.errorCount++;
      counters.rowErrors.push({ rowNumber, message: err instanceof Error ? err.message : String(err) });
    }
  }

  if (parsed.length === 0) return counters;

  // ---- shared reads ------------------------------------------------------
  const seenFingerprints = await loadExistingFingerprints(client, parsed.map((p) => p.fingerprint));
  const fresh = parsed.filter((p) => !seenFingerprints.has(p.fingerprint));
  counters.rowsSkipped += parsed.length - fresh.length; // idempotent: already recorded
  if (fresh.length === 0) return counters;

  const index = await IdentityIndex.load(client);
  const supplierIdsByName = await ensureSuppliers(client, fresh.map((p) => p.supplierName));

  const matchedIds = new Set<string>();
  const rowProductIds = new Map<number, string>();
  const queueRows: Record<string, unknown>[] = [];
  for (const row of fresh) {
    const productId = index.match({ barcode: row.barcode }).productId;
    if (!productId) {
      counters.unmatchedProducts++;
      counters.rowsSkipped++;
      queueRows.push({
        candidateType: "stock_in_import",
        rawIdentifier: row.barcode,
        rawTitle: row.title,
        rawBrand: row.brand,
        confidence: "LOW",
        metadata: { importJobId, rowNumber: row.rowNumber, invoiceId: row.invoiceId },
      });
      continue;
    }
    rowProductIds.set(row.rowNumber, productId);
    matchedIds.add(productId);
  }

  if (queueRows.length > 0) await client.matchingQueue.createMany({ data: queueRows as never[] });
  if (matchedIds.size === 0) return counters;

  const state = await loadProductState(client, [...matchedIds]);
  const balances = await loadRoverBalances(client, [...matchedIds], roverLocation.id);

  // ---- pass 2: roll the maths forward in row order ----------------------
  const txns: Record<string, unknown>[] = [];
  const history: Record<string, unknown>[] = [];

  for (const row of fresh) {
    const productId = rowProductIds.get(row.rowNumber);
    if (!productId) continue;
    const p = state.get(productId);
    if (!p) continue;

    const priceDiff = row.newCost != null && row.oldCost != null ? row.newCost - row.oldCost : null;
    const priceDiffPct = priceDiff != null && row.oldCost ? priceDiff / row.oldCost : null;
    const supplierId = row.supplierName ? supplierIdsByName.get(row.supplierName) ?? null : null;

    txns.push({
      id: newId(),
      productId,
      locationId: roverLocation.id,
      direction: "IN",
      sourceType: "STOCK_IN",
      qty: row.qty,
      transactionDate: row.date,
      invoiceId: row.invoiceId,
      newCostPrice: row.newCost,
      oldCostPrice: row.oldCost,
      brand: row.brand,
      productTitleRaw: row.title,
      barcodeRaw: row.barcode,
      fingerprint: row.fingerprint,
      supplierId,
      importJobId,
      createdAt: now,
    });

    history.push({
      id: newId(),
      productId,
      transactionId: row.fingerprint,
      date: row.date,
      invoiceId: row.invoiceId,
      supplierId,
      supplierName: row.supplierName,
      barcodeRaw: row.barcode,
      qty: row.qty,
      newCost: row.newCost ?? p.currentCost ?? 0,
      previousCost: row.oldCost,
      priceDiff,
      priceDiffPct,
      source: "stock_in_import",
      importJobId,
    });

    // Running product state — identical arithmetic to the row-at-a-time version.
    const priorQty = p.lifetimePurchasedQty;
    const priorAvg = p.weightedAvgCost != null ? p.weightedAvgCost : row.newCost ?? 0;
    p.weightedAvgCost = row.newCost != null ? (priorAvg * priorQty + row.newCost * row.qty) / (priorQty + row.qty || 1) : priorAvg;
    p.lowestHistoricalCost =
      p.lowestHistoricalCost == null || (row.newCost != null && row.newCost < p.lowestHistoricalCost)
        ? row.newCost ?? p.lowestHistoricalCost
        : p.lowestHistoricalCost;
    p.highestHistoricalCost =
      p.highestHistoricalCost == null || (row.newCost != null && row.newCost > p.highestHistoricalCost)
        ? row.newCost ?? p.highestHistoricalCost
        : p.highestHistoricalCost;
    p.currentCost = row.newCost ?? p.currentCost;
    p.lastPurchaseCost = row.newCost ?? p.lastPurchaseCost;
    p.lastPurchaseDate = row.date;
    p.firstPurchaseDate = p.firstPurchaseDate ?? row.date;
    p.purchaseCount += 1;
    p.lifetimePurchasedQty += row.qty;

    const balance = (balances.get(productId) ?? 0) + row.qty;
    balances.set(productId, balance);
    p.roverQty = balance;

    counters.newStockInTxns++;
    counters.rowsCreated++;
    counters.stockChanges++;
  }

  // ---- writes ------------------------------------------------------------
  for (let i = 0; i < txns.length; i += 500) {
    await client.inventoryTransaction.createMany({ data: txns.slice(i, i + 500) as never[], skipDuplicates: true });
  }
  for (let i = 0; i < history.length; i += 500) {
    await client.purchaseHistory.createMany({ data: history.slice(i, i + 500) as never[], skipDuplicates: true });
  }

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
    [...balances.entries()]
      .filter(([productId]) => state.has(productId))
      .map(([productId, qty]) => ({ id: newId(), productId, locationId: roverLocation.id, qty, updatedAt: now })),
    { updateColumns: ["qty", "updatedAt"] }
  );

  await bulkUpdateById(
    client,
    "products",
    PRODUCT_COLUMNS,
    [...state.entries()].map(([id, p]) => ({
      id,
      roverQty: p.roverQty,
      currentCost: p.currentCost,
      lastPurchaseCost: p.lastPurchaseCost,
      lastPurchaseDate: p.lastPurchaseDate,
      firstPurchaseDate: p.firstPurchaseDate,
      weightedAvgCost: p.weightedAvgCost,
      lowestHistoricalCost: p.lowestHistoricalCost,
      highestHistoricalCost: p.highestHistoricalCost,
      purchaseCount: p.purchaseCount,
      lifetimePurchasedQty: p.lifetimePurchasedQty,
      updatedAt: now,
    }))
  );

  counters.touchedProductIds = [...matchedIds];
  return counters;
}

async function loadExistingFingerprints(client: PrismaClient, fingerprints: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < fingerprints.length; i += 1000) {
    const rows = await client.inventoryTransaction.findMany({
      where: { fingerprint: { in: fingerprints.slice(i, i + 1000) } },
      select: { fingerprint: true },
    });
    for (const row of rows) found.add(row.fingerprint);
  }
  return found;
}

async function ensureSuppliers(client: PrismaClient, names: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(names.filter((n): n is string => !!n))];
  const byName = new Map<string, string>();
  if (wanted.length === 0) return byName;

  const existing = await client.supplier.findMany({ where: { name: { in: wanted } }, select: { id: true, name: true } });
  for (const s of existing) byName.set(s.name, s.id);

  const missing = wanted.filter((n) => !byName.has(n));
  if (missing.length > 0) {
    await client.supplier.createMany({ data: missing.map((name) => ({ id: newId(), name })), skipDuplicates: true });
    const created = await client.supplier.findMany({ where: { name: { in: missing } }, select: { id: true, name: true } });
    for (const s of created) byName.set(s.name, s.id);
  }
  return byName;
}

async function loadProductState(client: PrismaClient, productIds: string[]): Promise<Map<string, RunningProductState>> {
  const state = new Map<string, RunningProductState>();
  for (let i = 0; i < productIds.length; i += 1000) {
    const rows = await client.product.findMany({
      where: { id: { in: productIds.slice(i, i + 1000) } },
      select: {
        id: true,
        roverQty: true,
        currentCost: true,
        lastPurchaseCost: true,
        lastPurchaseDate: true,
        firstPurchaseDate: true,
        weightedAvgCost: true,
        lowestHistoricalCost: true,
        highestHistoricalCost: true,
        purchaseCount: true,
        lifetimePurchasedQty: true,
      },
    });
    for (const r of rows) {
      state.set(r.id, {
        roverQty: r.roverQty,
        currentCost: num(r.currentCost),
        lastPurchaseCost: num(r.lastPurchaseCost),
        lastPurchaseDate: r.lastPurchaseDate,
        firstPurchaseDate: r.firstPurchaseDate,
        weightedAvgCost: num(r.weightedAvgCost),
        lowestHistoricalCost: num(r.lowestHistoricalCost),
        highestHistoricalCost: num(r.highestHistoricalCost),
        purchaseCount: r.purchaseCount,
        lifetimePurchasedQty: r.lifetimePurchasedQty,
      });
    }
  }
  return state;
}

async function loadRoverBalances(client: PrismaClient, productIds: string[], locationId: string): Promise<Map<string, number>> {
  const balances = new Map<string, number>();
  for (let i = 0; i < productIds.length; i += 1000) {
    const rows = await client.inventoryBalance.findMany({
      where: { locationId, productId: { in: productIds.slice(i, i + 1000) } },
      select: { productId: true, qty: true },
    });
    for (const r of rows) balances.set(r.productId, r.qty);
  }
  return balances;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "object" && v !== null && "toNumber" in (v as never) ? (v as { toNumber: () => number }).toNumber() : Number(v);
  return Number.isFinite(n) ? n : null;
}
