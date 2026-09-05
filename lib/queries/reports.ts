import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../prisma";
import { getSettings } from "../settings-store";
import { classifySupplierMatch } from "../calc/supplier";

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && v !== null && "toNumber" in (v as never)) return (v as { toNumber: () => number }).toNumber();
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ---- Shared operational snapshot -------------------------------------------
//
// Many of the section-36 reports (OOS, Near OOS, Fast/Slow-Moving, No-Sale,
// Overstock, Loss-Making, Low ROI, BSR-priority reorders, per-location and
// per-brand rollups) are all just different filters/groupings over the same
// per-product operational state. Rather than issue ~12 near-identical
// findMany() calls against a ~3,000-row product table, fetch it once here
// and let each report function filter/group the same in-memory snapshot —
// same numbers everywhere (this reuses the exact thresholds the Dashboard
// KPIs and Alert engine already use), one query cost.

export interface OperationalRow {
  id: string;
  title: string;
  barcode: string | null;
  asin: string | null;
  brand: string | null;
  catalogSource: string;
  bsr: number | null;
  t30Sales: number;
  amazonQty: number;
  roverQty: number;
  officeQty: number;
  incomingQty: number;
  shelfLocation: string | null;
  qtyPerBox: number | null;
  totalBoxes: number | null;
  looseQty: number | null;
  netAvailable: number | null;
  stockStatus: string | null;
  daysOfStock: number | null;
  reorderStatus: string;
  priority: string | null;
  recommendedQty30: number;
  recommendedQty60: number;
  unitCost: number | null;
  inventoryValue: number;
  profitStatus: string;
  roiPct: number | null;
  marginPct: number | null;
  profitPerUnit: number | null;
  hasSupplier: boolean;
}

async function getOperationalSnapshot(client: PrismaClient): Promise<OperationalRow[]> {
  const products = await client.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      title: true,
      primaryBarcode: true,
      asin: true,
      brand: true,
      catalogSource: true,
      bsr: true,
      unitsShippedT30: true,
      amazonAvailableQty: true,
      roverQty: true,
      officeQty: true,
      incomingPoQty: true,
      shelfLocation: true,
      qtyPerBox: true,
      totalBoxes: true,
      looseQty: true,
      currentCost: true,
      inventoryValue: true,
      profitStatus: true,
      roiPct: true,
      marginPct: true,
      profitPerUnit: true,
      reorderStatus: true,
      supplierProducts: { where: { isActive: true }, select: { id: true }, take: 1 },
      reorderRecs: {
        where: { isLatest: true },
        take: 1,
        select: { stockStatus: true, daysOfStock: true, priority: true, recommendedQty30: true, recommendedQty60: true, netAvailable: true },
      },
    },
  });

  return products.map((p): OperationalRow => {
    const rec = p.reorderRecs[0];
    return {
      id: p.id,
      title: p.title,
      barcode: p.primaryBarcode,
      asin: p.asin,
      brand: p.brand,
      catalogSource: p.catalogSource as string,
      bsr: p.bsr,
      t30Sales: p.unitsShippedT30 ?? 0,
      amazonQty: p.amazonAvailableQty,
      roverQty: p.roverQty,
      officeQty: p.officeQty,
      incomingQty: p.incomingPoQty,
      shelfLocation: p.shelfLocation,
      qtyPerBox: p.qtyPerBox,
      totalBoxes: p.totalBoxes,
      looseQty: p.looseQty,
      netAvailable: rec ? rec.netAvailable : null,
      stockStatus: rec?.stockStatus ?? null,
      daysOfStock: num(rec?.daysOfStock),
      reorderStatus: p.reorderStatus as string,
      priority: rec ? (rec.priority as string) : null,
      recommendedQty30: rec?.recommendedQty30 ?? 0,
      recommendedQty60: rec?.recommendedQty60 ?? 0,
      unitCost: num(p.currentCost),
      inventoryValue: num(p.inventoryValue) ?? 0,
      profitStatus: p.profitStatus as string,
      roiPct: num(p.roiPct),
      marginPct: num(p.marginPct),
      profitPerUnit: num(p.profitPerUnit),
      hasSupplier: p.supplierProducts.length > 0,
    };
  });
}

// ---- Inventory Valuation ---------------------------------------------------

export interface InventoryValuationRow {
  id: string;
  title: string;
  barcode: string | null;
  amazonQty: number;
  roverQty: number;
  officeQty: number;
  totalQty: number;
  unitCost: number | null;
  inventoryValue: number;
}

export async function getInventoryValuationReport(client: PrismaClient = defaultPrisma): Promise<{ rows: InventoryValuationRow[]; totalValue: number; totalUnits: number }> {
  const products = await client.product.findMany({
    where: { isActive: true },
    select: { id: true, title: true, primaryBarcode: true, amazonAvailableQty: true, roverQty: true, officeQty: true, currentCost: true },
    orderBy: { title: "asc" },
  });

  const rows: InventoryValuationRow[] = products.map((p) => {
    const totalQty = p.amazonAvailableQty + p.roverQty + p.officeQty;
    const unitCost = num(p.currentCost);
    return {
      id: p.id,
      title: p.title,
      barcode: p.primaryBarcode,
      amazonQty: p.amazonAvailableQty,
      roverQty: p.roverQty,
      officeQty: p.officeQty,
      totalQty,
      unitCost,
      inventoryValue: unitCost != null ? unitCost * totalQty : 0,
    };
  });

  return {
    rows,
    totalValue: rows.reduce((s, r) => s + r.inventoryValue, 0),
    totalUnits: rows.reduce((s, r) => s + r.totalQty, 0),
  };
}

// ---- Profitability ----------------------------------------------------------

export interface ProfitabilityRow {
  id: string;
  title: string;
  barcode: string | null;
  sellingPrice: number | null;
  cost: number | null;
  profitPerUnit: number | null;
  marginPct: number | null;
  roiPct: number | null;
  profitStatus: string;
  unitsShippedT30: number | null;
  estimated30dProfit: number | null;
}

export async function getProfitabilityReport(client: PrismaClient = defaultPrisma): Promise<{ rows: ProfitabilityRow[]; totalEstimatedProfit30d: number }> {
  const products = await client.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      title: true,
      primaryBarcode: true,
      ourPrice: true,
      buyBoxPrice: true,
      currentCost: true,
      profitPerUnit: true,
      marginPct: true,
      roiPct: true,
      profitStatus: true,
      unitsShippedT30: true,
    },
    orderBy: { profitPerUnit: "asc" },
  });

  const rows: ProfitabilityRow[] = products.map((p) => {
    const profitPerUnit = num(p.profitPerUnit);
    const t30 = p.unitsShippedT30 ?? 0;
    return {
      id: p.id,
      title: p.title,
      barcode: p.primaryBarcode,
      sellingPrice: num(p.ourPrice) ?? num(p.buyBoxPrice),
      cost: num(p.currentCost),
      profitPerUnit,
      marginPct: num(p.marginPct),
      roiPct: num(p.roiPct),
      profitStatus: p.profitStatus,
      unitsShippedT30: p.unitsShippedT30,
      estimated30dProfit: profitPerUnit != null ? profitPerUnit * t30 : null,
    };
  });

  return { rows, totalEstimatedProfit30d: rows.reduce((s, r) => s + (r.estimated30dProfit ?? 0), 0) };
}

// ---- Reorder Needs ------------------------------------------------------------

export interface ReorderNeedsRow {
  id: string;
  title: string;
  barcode: string | null;
  priority: string;
  reorderStatus: string;
  stockStatus: string | null;
  daysOfStock: number | null;
  recommendedQty30: number;
  bestSupplierName: string | null;
  bestSupplierPrice: number | null;
  expectedTotalCost: number | null;
  expectedProfit: number | null;
}

export async function getReorderNeedsReport(client: PrismaClient = defaultPrisma): Promise<{ rows: ReorderNeedsRow[]; totalRecommendedCost: number }> {
  const products = await client.product.findMany({
    where: { isActive: true },
    include: { reorderRecs: { where: { isLatest: true }, take: 1 } },
  });

  const supplierIds = [...new Set(products.flatMap((p) => (p.reorderRecs[0]?.bestSupplierId ? [p.reorderRecs[0].bestSupplierId] : [])))];
  const suppliers = await client.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, name: true } });
  const supplierNameById = new Map(suppliers.map((s) => [s.id, s.name]));

  const rows = products
    .map((p): ReorderNeedsRow | null => {
      const rec = p.reorderRecs[0];
      if (!rec || rec.recommendedQty30 <= 0) return null;
      const bestSupplierPrice = num(rec.bestSupplierPrice);
      const expectedProfitPerUnit = num(rec.expectedProfitPerUnit);
      return {
        id: p.id,
        title: p.title,
        barcode: p.primaryBarcode,
        priority: rec.priority as string,
        reorderStatus: rec.reorderStatus as string,
        stockStatus: rec.stockStatus,
        daysOfStock: num(rec.daysOfStock),
        recommendedQty30: rec.recommendedQty30,
        bestSupplierName: rec.bestSupplierId ? supplierNameById.get(rec.bestSupplierId) ?? null : null,
        bestSupplierPrice,
        expectedTotalCost: bestSupplierPrice != null ? bestSupplierPrice * rec.recommendedQty30 : null,
        expectedProfit: expectedProfitPerUnit != null ? expectedProfitPerUnit * rec.recommendedQty30 : null,
      };
    })
    .filter((r): r is ReorderNeedsRow => r !== null)
    .sort((a, b) => {
      const order = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"];
      return order.indexOf(a.priority) - order.indexOf(b.priority);
    });

  return { rows, totalRecommendedCost: rows.reduce((s, r) => s + (r.expectedTotalCost ?? 0), 0) };
}

// ---- Supplier Spend ------------------------------------------------------------

export interface SupplierSpendRow {
  id: string;
  name: string;
  isActive: boolean;
  transactionCount: number;
  totalUnits: number;
  totalSpend: number;
  avgUnitCost: number | null;
  lastPurchaseDate: string | null;
}

export async function getSupplierSpendReport(client: PrismaClient = defaultPrisma): Promise<{ rows: SupplierSpendRow[]; grandTotalSpend: number }> {
  const [suppliers, history] = await Promise.all([
    client.supplier.findMany({ select: { id: true, name: true, isActive: true } }),
    client.purchaseHistory.findMany({ where: { supplierId: { not: null } }, select: { supplierId: true, qty: true, newCost: true, date: true } }),
  ]);

  const bySupplier = new Map<string, { count: number; units: number; spend: number; lastDate: Date | null }>();
  for (const h of history) {
    const key = h.supplierId as string;
    const entry = bySupplier.get(key) ?? { count: 0, units: 0, spend: 0, lastDate: null };
    entry.count += 1;
    entry.units += h.qty;
    entry.spend += (num(h.newCost) ?? 0) * h.qty;
    if (!entry.lastDate || h.date > entry.lastDate) entry.lastDate = h.date;
    bySupplier.set(key, entry);
  }

  const rows: SupplierSpendRow[] = suppliers
    .map((s) => {
      const entry = bySupplier.get(s.id);
      if (!entry) return null;
      return {
        id: s.id,
        name: s.name,
        isActive: s.isActive,
        transactionCount: entry.count,
        totalUnits: entry.units,
        totalSpend: entry.spend,
        avgUnitCost: entry.units > 0 ? entry.spend / entry.units : null,
        lastPurchaseDate: entry.lastDate?.toISOString() ?? null,
      };
    })
    .filter((r): r is SupplierSpendRow => r !== null)
    .sort((a, b) => b.totalSpend - a.totalSpend);

  return { rows, grandTotalSpend: rows.reduce((s, r) => s + r.totalSpend, 0) };
}

// ---- Location reports (spec section 36: Amazon / Rover / Office / Total Inventory) ------

export interface LocationInventoryRow {
  id: string;
  title: string;
  barcode: string | null;
  brand: string | null;
  qty: number;
  unitCost: number | null;
  value: number;
}

function toLocationRows(snapshot: OperationalRow[], qtyOf: (r: OperationalRow) => number): { rows: LocationInventoryRow[]; totalQty: number; totalValue: number } {
  const rows = snapshot
    .map((r) => {
      const qty = qtyOf(r);
      if (qty === 0) return null;
      return { id: r.id, title: r.title, barcode: r.barcode, brand: r.brand, qty, unitCost: r.unitCost, value: (r.unitCost ?? 0) * qty };
    })
    .filter((r): r is LocationInventoryRow => r !== null)
    .sort((a, b) => b.value - a.value);
  return { rows, totalQty: rows.reduce((s, r) => s + r.qty, 0), totalValue: rows.reduce((s, r) => s + r.value, 0) };
}

export async function getAmazonInventoryReport(client: PrismaClient = defaultPrisma) {
  return toLocationRows(await getOperationalSnapshot(client), (r) => r.amazonQty);
}

export async function getRoverInventoryReport(client: PrismaClient = defaultPrisma) {
  return toLocationRows(await getOperationalSnapshot(client), (r) => r.roverQty);
}

export async function getOfficeInventoryReport(client: PrismaClient = defaultPrisma) {
  return toLocationRows(await getOperationalSnapshot(client), (r) => r.officeQty);
}

export interface TotalInventoryRow {
  id: string;
  title: string;
  barcode: string | null;
  brand: string | null;
  amazonQty: number;
  roverQty: number;
  officeQty: number;
  incomingQty: number;
  totalQty: number;
  reorderStatus: string;
  stockStatus: string | null;
}

/** "Total Inventory" (spec 36): every location side by side, one row per product — distinct from
 * Inventory Valuation (section-36 report focused on AED value) by focusing on quantity + status. */
export async function getTotalInventoryReport(client: PrismaClient = defaultPrisma): Promise<{ rows: TotalInventoryRow[]; totalUnits: number }> {
  const snapshot = await getOperationalSnapshot(client);
  const rows: TotalInventoryRow[] = snapshot
    .map((r) => ({
      id: r.id,
      title: r.title,
      barcode: r.barcode,
      brand: r.brand,
      amazonQty: r.amazonQty,
      roverQty: r.roverQty,
      officeQty: r.officeQty,
      incomingQty: r.incomingQty,
      totalQty: r.amazonQty + r.roverQty + r.officeQty + r.incomingQty,
      reorderStatus: r.reorderStatus,
      stockStatus: r.stockStatus,
    }))
    .sort((a, b) => b.totalQty - a.totalQty);
  return { rows, totalUnits: rows.reduce((s, r) => s + r.totalQty, 0) };
}

// ---- Inventory by Brand ------------------------------------------------------

export interface BrandInventoryRow {
  brand: string;
  productCount: number;
  amazonQty: number;
  roverQty: number;
  officeQty: number;
  totalQty: number;
  inventoryValue: number;
}

export async function getInventoryByBrandReport(client: PrismaClient = defaultPrisma): Promise<{ rows: BrandInventoryRow[]; totalValue: number }> {
  const snapshot = await getOperationalSnapshot(client);
  const byBrand = new Map<string, BrandInventoryRow>();
  for (const r of snapshot) {
    const key = r.brand?.trim() || "(No Brand)";
    const entry = byBrand.get(key) ?? { brand: key, productCount: 0, amazonQty: 0, roverQty: 0, officeQty: 0, totalQty: 0, inventoryValue: 0 };
    entry.productCount += 1;
    entry.amazonQty += r.amazonQty;
    entry.roverQty += r.roverQty;
    entry.officeQty += r.officeQty;
    entry.totalQty += r.amazonQty + r.roverQty + r.officeQty;
    entry.inventoryValue += r.inventoryValue;
    byBrand.set(key, entry);
  }
  const rows = [...byBrand.values()].sort((a, b) => b.inventoryValue - a.inventoryValue);
  return { rows, totalValue: rows.reduce((s, r) => s + r.inventoryValue, 0) };
}

// ---- Stock-status / demand-based reports (OOS, Near OOS, Fast/Slow-Moving, No-Sale, Overstock) ----
//
// Every threshold below is read from Settings and mirrors the exact same
// rule the Dashboard KPI tiles and Alert engine use (lib/queries/dashboard.ts,
// lib/engine/alerts.ts) — a product counted here as "Fast-Moving" is the
// same product counted fast-moving everywhere else in the app.

export interface StockStatusReportRow {
  id: string;
  title: string;
  barcode: string | null;
  brand: string | null;
  bsr: number | null;
  t30Sales: number;
  amazonQty: number;
  roverQty: number;
  officeQty: number;
  netAvailable: number | null;
  daysOfStock: number | null;
  stockStatus: string | null;
  reorderStatus: string;
  priority: string | null;
  recommendedQty30: number;
}

function toStockStatusRow(r: OperationalRow): StockStatusReportRow {
  return {
    id: r.id,
    title: r.title,
    barcode: r.barcode,
    brand: r.brand,
    bsr: r.bsr,
    t30Sales: r.t30Sales,
    amazonQty: r.amazonQty,
    roverQty: r.roverQty,
    officeQty: r.officeQty,
    netAvailable: r.netAvailable,
    daysOfStock: r.daysOfStock,
    stockStatus: r.stockStatus,
    reorderStatus: r.reorderStatus,
    priority: r.priority,
    recommendedQty30: r.recommendedQty30,
  };
}

export async function getOosReport(client: PrismaClient = defaultPrisma): Promise<StockStatusReportRow[]> {
  const snapshot = await getOperationalSnapshot(client);
  return snapshot.filter((r) => r.stockStatus === "OOS").map(toStockStatusRow);
}

export async function getNearOosReport(client: PrismaClient = defaultPrisma): Promise<StockStatusReportRow[]> {
  const snapshot = await getOperationalSnapshot(client);
  return snapshot.filter((r) => r.stockStatus === "NEAR_OOS").map(toStockStatusRow);
}

/** BSR <= threshold reorders (spec 36 "BSR <= 5,000 Reorders"): priority-tier products that still need buying. */
export async function getBsrPriorityReorderReport(client: PrismaClient = defaultPrisma): Promise<StockStatusReportRow[]> {
  const [snapshot, settings] = await Promise.all([getOperationalSnapshot(client), getSettings(client)]);
  return snapshot
    .filter((r) => r.bsr != null && r.bsr > 0 && r.bsr <= settings.priorityBsrThreshold && r.recommendedQty30 > 0)
    .map(toStockStatusRow)
    .sort((a, b) => (a.bsr ?? 0) - (b.bsr ?? 0));
}

/** Fast-moving: T30 sales >= highSalesThreshold — identical rule to the Dashboard KPI. */
export async function getFastMovingReport(client: PrismaClient = defaultPrisma): Promise<StockStatusReportRow[]> {
  const [snapshot, settings] = await Promise.all([getOperationalSnapshot(client), getSettings(client)]);
  return snapshot.filter((r) => r.t30Sales >= settings.highSalesThreshold).map(toStockStatusRow).sort((a, b) => b.t30Sales - a.t30Sales);
}

/** Slow-moving: 0 < T30 sales < highSalesThreshold/3 — identical rule to the Dashboard KPI. */
export async function getSlowMovingReport(client: PrismaClient = defaultPrisma): Promise<StockStatusReportRow[]> {
  const [snapshot, settings] = await Promise.all([getOperationalSnapshot(client), getSettings(client)]);
  return snapshot.filter((r) => r.t30Sales > 0 && r.t30Sales < settings.highSalesThreshold / 3).map(toStockStatusRow).sort((a, b) => a.t30Sales - b.t30Sales);
}

/** No-Sale: zero T30 units shipped — identical rule to the Dashboard KPI. */
export async function getNoSaleReport(client: PrismaClient = defaultPrisma): Promise<StockStatusReportRow[]> {
  const snapshot = await getOperationalSnapshot(client);
  return snapshot.filter((r) => r.t30Sales === 0).map(toStockStatusRow);
}

/** Overstock: days of stock beyond overstockDaysThreshold — identical rule to the Alert engine's OVERSTOCK alert. */
export async function getOverstockReport(client: PrismaClient = defaultPrisma): Promise<StockStatusReportRow[]> {
  const [snapshot, settings] = await Promise.all([getOperationalSnapshot(client), getSettings(client)]);
  return snapshot
    .filter((r) => r.daysOfStock != null && r.daysOfStock > settings.overstockDaysThreshold)
    .map(toStockStatusRow)
    .sort((a, b) => (b.daysOfStock ?? 0) - (a.daysOfStock ?? 0));
}

// ---- Profitability-filtered reports (Loss-Making, Low ROI) -------------------

export interface ProfitFilterRow {
  id: string;
  title: string;
  barcode: string | null;
  brand: string | null;
  unitCost: number | null;
  profitPerUnit: number | null;
  marginPct: number | null;
  roiPct: number | null;
  profitStatus: string;
  t30Sales: number;
}

function toProfitFilterRow(r: OperationalRow): ProfitFilterRow {
  return {
    id: r.id,
    title: r.title,
    barcode: r.barcode,
    brand: r.brand,
    unitCost: r.unitCost,
    profitPerUnit: r.profitPerUnit,
    marginPct: r.marginPct,
    roiPct: r.roiPct,
    profitStatus: r.profitStatus,
    t30Sales: r.t30Sales,
  };
}

export async function getLossMakingReport(client: PrismaClient = defaultPrisma): Promise<ProfitFilterRow[]> {
  const snapshot = await getOperationalSnapshot(client);
  return snapshot.filter((r) => r.profitStatus === "LOSS").map(toProfitFilterRow).sort((a, b) => (a.profitPerUnit ?? 0) - (b.profitPerUnit ?? 0));
}

/** Low ROI: below the configured minimum ROI, but not already a loss (loss-making has its own report). */
export async function getLowRoiReport(client: PrismaClient = defaultPrisma): Promise<ProfitFilterRow[]> {
  const [snapshot, settings] = await Promise.all([getOperationalSnapshot(client), getSettings(client)]);
  const minRoiPct = settings.minRoiPct * 100;
  return snapshot
    .filter((r) => r.roiPct != null && r.roiPct < minRoiPct && r.profitStatus !== "LOSS")
    .map(toProfitFilterRow)
    .sort((a, b) => (a.roiPct ?? 0) - (b.roiPct ?? 0));
}

// ---- Purchase Price Changes ---------------------------------------------------

export interface PurchasePriceChangeRow {
  id: string;
  effectiveDate: string;
  productId: string;
  productTitle: string;
  productBarcode: string | null;
  supplierName: string;
  oldPrice: number;
  newPrice: number;
  priceDiff: number;
  priceDiffPct: number | null;
}

/** Every recorded supplier price CHANGE (spec 36 "Purchase Price Changes") — the first-ever
 * price for a supplier/product pair is a listing, not a change, so it's excluded. */
export async function getPurchasePriceChangesReport(client: PrismaClient = defaultPrisma): Promise<{ rows: PurchasePriceChangeRow[] }> {
  const history = await client.supplierPriceHistory.findMany({
    orderBy: [{ supplierProductId: "asc" }, { effectiveDate: "asc" }],
    include: { supplierProduct: { include: { product: { select: { id: true, title: true, primaryBarcode: true } }, supplier: { select: { name: true } } } } },
  });

  const rows: PurchasePriceChangeRow[] = [];
  let prevBySpId = new Map<string, number>();
  for (const h of history) {
    const price = num(h.price) ?? 0;
    const prev = prevBySpId.get(h.supplierProductId);
    if (prev !== undefined && prev !== price) {
      const diff = price - prev;
      rows.push({
        id: h.id,
        effectiveDate: h.effectiveDate.toISOString(),
        productId: h.supplierProduct.product.id,
        productTitle: h.supplierProduct.product.title,
        productBarcode: h.supplierProduct.product.primaryBarcode,
        supplierName: h.supplierProduct.supplier.name,
        oldPrice: prev,
        newPrice: price,
        priceDiff: diff,
        priceDiffPct: prev !== 0 ? diff / prev : null,
      });
    }
    prevBySpId.set(h.supplierProductId, price);
  }

  return { rows: rows.sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime()) };
}

// ---- Invoice Discrepancies ---------------------------------------------------

export interface InvoiceDiscrepancyRow {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string | null;
  supplierName: string | null;
  productId: string | null;
  productTitle: string | null;
  barcodeRaw: string | null;
  invoiceQty: number;
  invoicePrice: number;
  referencePrice: number | null;
  priceDiff: number | null;
  priceDiffPct: number | null;
  status: string;
}

/** Every invoice line that ISN'T a clean PRICE_OK match, across every invoice ever uploaded
 * (spec 36 "Invoice Discrepancies") — the same classification the Invoice Checker screen uses. */
export async function getInvoiceDiscrepanciesReport(client: PrismaClient = defaultPrisma): Promise<{ rows: InvoiceDiscrepancyRow[] }> {
  const items = await client.invoiceItem.findMany({
    where: { status: { not: "PRICE_OK" } },
    include: {
      invoice: { include: { supplier: { select: { name: true } } } },
      product: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });

  const rows: InvoiceDiscrepancyRow[] = items.map((it) => {
    const referencePrice = num(it.lastPurchasePrice) ?? num(it.currentMasterCost) ?? num(it.weightedAvgPrice) ?? num(it.lowestHistoricalPrice);
    return {
      id: it.id,
      invoiceId: it.invoiceId,
      invoiceNumber: it.invoice.invoiceNumber,
      invoiceDate: it.invoice.invoiceDate?.toISOString() ?? null,
      supplierName: it.invoice.supplier?.name ?? null,
      productId: it.product?.id ?? null,
      productTitle: it.product?.title ?? it.titleRaw,
      barcodeRaw: it.barcodeRaw,
      invoiceQty: it.invoiceQty,
      invoicePrice: num(it.invoicePrice) ?? 0,
      referencePrice,
      priceDiff: num(it.priceDiff),
      priceDiffPct: num(it.priceDiffPct),
      status: it.status as string,
    };
  });

  return { rows };
}

// ---- Supplier Availability ---------------------------------------------------

export interface SupplierAvailabilityRow {
  supplierId: string;
  supplierName: string;
  productId: string;
  productTitle: string;
  barcode: string | null;
  price: number;
  stockQty: number | null;
  moq: number | null;
  leadTimeDays: number | null;
  lastUpdated: string;
  matchOutcome: string;
}

/** Every active supplier offer, classified by what opportunity it represents right now
 * (spec 18/36 "Supplier Availability") — reuses the same classifySupplierMatch() logic
 * the supplier price-list upload flow is specified to use. */
export async function getSupplierAvailabilityReport(client: PrismaClient = defaultPrisma): Promise<{ rows: SupplierAvailabilityRow[]; counts: Record<string, number> }> {
  const [offers, settings] = await Promise.all([
    client.supplierProduct.findMany({
      where: { isActive: true },
      include: {
        supplier: { select: { id: true, name: true } },
        product: {
          select: {
            id: true,
            title: true,
            primaryBarcode: true,
            currentCost: true,
            fbaFee: true,
            ourPrice: true,
            buyBoxPrice: true,
            reorderRecs: { where: { isLatest: true }, take: 1, select: { stockStatus: true } },
          },
        },
      },
    }),
    getSettings(client),
  ]);

  const { calculateProfit } = await import("../calc/profitability");

  const counts: Record<string, number> = {};
  const rows: SupplierAvailabilityRow[] = offers.map((o) => {
    const price = num(o.price) ?? 0;
    const sellingPrice = num(o.product.ourPrice) ?? num(o.product.buyBoxPrice);
    const fbaFee = num(o.product.fbaFee);
    const stockStatus = o.product.reorderRecs[0]?.stockStatus as "OOS" | "CRITICAL" | "NEAR_OOS" | "LOW_STOCK" | "HEALTHY" | undefined;
    const isProfitable = sellingPrice != null ? calculateProfit({ sellingPrice, purchaseCost: price, fbaFee }, settings).roiPct >= settings.minRoiPct * 100 : false;
    const matchOutcome = classifySupplierMatch({ matched: true, stockStatus, isProfitable });
    counts[matchOutcome] = (counts[matchOutcome] ?? 0) + 1;
    return {
      supplierId: o.supplier.id,
      supplierName: o.supplier.name,
      productId: o.product.id,
      productTitle: o.product.title,
      barcode: o.product.primaryBarcode,
      price,
      stockQty: o.stockQty,
      moq: o.moq,
      leadTimeDays: o.leadTimeDays,
      lastUpdated: o.lastUpdated.toISOString(),
      matchOutcome,
    };
  });

  rows.sort((a, b) => {
    const order = ["URGENT_REORDER_OPPORTUNITY", "REORDER_OPPORTUNITY", "AVAILABLE_BUT_NOT_PROFITABLE", "MATCHED_ALREADY_SELLING", "UNMATCHED"];
    return order.indexOf(a.matchOutcome) - order.indexOf(b.matchOutcome);
  });

  return { rows, counts };
}
