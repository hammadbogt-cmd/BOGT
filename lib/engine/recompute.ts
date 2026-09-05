import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../prisma";
import { getSettings } from "../settings-store";
import { calculateProfit, calculateBreakevenPrice } from "../calc/profitability";
import {
  targetDemand,
  calculateRecommendedQty,
  averageDailySales,
  daysOfStock,
  classifyStockStatus,
  calculatePriority,
  type StockStatus,
} from "../calc/reorder";
import { pickBestSupplier, evaluateOffers } from "../calc/supplier";
import type { BusinessSettings } from "../calc/settings";
import { evaluateProductAlerts } from "./alerts";

/**
 * Recomputes every derived value for one product: profitability, days of
 * stock, reorder recommendation (30 & 60 day), listing/reorder status, and
 * inventory value. Called after any import/sync that touches a product, and
 * whenever settings change (spec section 13: "Whenever Amazon selling price
 * changes, supplier price changes, FBA fee changes, referral rule changes,
 * recalculate profit automatically").
 *
 * This is intentionally idempotent and safe to re-run: it always reads
 * fresh inputs from the DB and writes a full new snapshot, never mutates
 * historical records.
 */
export async function recomputeProduct(productId: string, client: PrismaClient = defaultPrisma) {
  const settings = await getSettings(client);

  const product = await client.product.findUnique({
    where: { id: productId },
    include: {
      supplierProducts: { where: { isActive: true }, include: { supplier: true } },
    },
  });
  if (!product) return;

  // ---- Profitability -----------------------------------------------------
  const sellingPrice = toNum(product.ourPrice) ?? toNum(product.buyBoxPrice);
  const cost = toNum(product.currentCost);
  let profitStatus: "HIGH_PROFIT" | "PROFITABLE" | "LOW_PROFIT" | "BREAK_EVEN" | "LOSS" | "UNKNOWN" = "UNKNOWN";
  let profitPerUnit: number | null = null;
  let roiPct: number | null = null;
  let marginPct: number | null = null;
  let breakevenPrice: number | null = null;
  let fbaFee: number | null = toNum(product.fbaFee);
  let referralFee: number | null = null;

  if (sellingPrice != null && cost != null) {
    const p = calculateProfit({ sellingPrice, purchaseCost: cost, fbaFee }, settings);
    profitStatus = p.status;
    profitPerUnit = p.profit;
    roiPct = p.roiPct;
    marginPct = p.marginPct;
    fbaFee = p.fbaFee;
    referralFee = p.referralFee;
    breakevenPrice = calculateBreakevenPrice(cost, settings, fbaFee);
  }

  // ---- Inventory value -----------------------------------------------------
  const inventoryValue =
    cost != null
      ? (product.amazonAvailableQty + product.roverQty + product.officeQty) * cost
      : null;

  // ---- Reorder engine ------------------------------------------------------
  const amazonQty = product.amazonAvailableQty;
  const roverQty = product.roverQty;
  const officeQty = product.officeQty;
  const incomingQty = product.incomingPoQty;

  const t30 = product.unitsShippedT30 ?? 0;
  const t60Row = await client.salesHistory.findFirst({
    where: { productId, periodType: "T60" },
    orderBy: { periodEnd: "desc" },
  });
  const t60IsEstimated = !t60Row;
  const t60 = t60Row ? t60Row.unitsSold : t30 * 2; // transparent estimate, flagged below

  const target30 = targetDemand(t30, product.bsr, 30, settings);
  const target60 = targetDemand(t60, product.bsr, 60, settings);

  const availability = { amazonQty, roverQty, officeQty, incomingQty };
  const rec30 = calculateRecommendedQty(target30, settings.safetyStockDefault, availability, settings);
  const rec60 = calculateRecommendedQty(target60, settings.safetyStockDefault, availability, settings);

  const avgDaily = averageDailySales(t30);
  const days = daysOfStock(rec30.netAvailable, avgDaily);
  const stockStatus: StockStatus = classifyStockStatus(days, rec30.netAvailable, settings);

  const offers = product.supplierProducts.map((sp) => ({
    supplierId: sp.supplierId,
    supplierName: sp.supplier.name,
    price: toNum(sp.price) ?? 0,
    stockQty: sp.stockQty,
    moq: sp.moq,
    leadTimeDays: sp.leadTimeDays,
    priorityWeight: sp.supplier.priority,
  }));

  let bestSupplierId: string | null = null;
  let bestSupplierPrice: number | null = null;
  let expectedProfitPerUnit: number | null = null;
  let expectedRoiPct: number | null = null;
  if (sellingPrice != null && offers.length > 0 && rec30.recommendedQty > 0) {
    const { best } = pickBestSupplier(offers, sellingPrice, rec30.recommendedQty, settings, fbaFee);
    if (best) {
      bestSupplierId = best.supplierId;
      bestSupplierPrice = best.price;
      expectedProfitPerUnit = best.profit;
      expectedRoiPct = best.roiPct;
    }
  }

  const isProfitableToReorder = profitStatus !== "LOSS" && profitStatus !== "UNKNOWN" && (roiPct ?? 0) / 100 >= settings.minRoiPct;
  const priority = calculatePriority(
    { bsr: product.bsr, stockStatus, recommendedQty: rec30.recommendedQty, hasSupplier: offers.length > 0, isProfitable: isProfitableToReorder },
    settings
  );

  const reorderStatus = deriveReorderStatus({
    recommendedQty: rec30.recommendedQty,
    stockStatus,
    hasSupplier: offers.length > 0,
    isProfitableToReorder,
  });

  const listingStatus = deriveListingStatus({
    amazonAvailableQty: amazonQty,
    buyBoxPrice: toNum(product.buyBoxPrice),
    ourPrice: sellingPrice,
    profitStatus,
    inbound: product.amazonInboundQty,
    reserved: product.amazonReservedQty,
    unfulfillable: product.amazonUnfulfillableQty,
  });

  await client.$transaction([
    client.product.update({
      where: { id: productId },
      data: {
        profitStatus: profitStatus as never,
        profitPerUnit: profitPerUnit ?? undefined,
        roiPct: roiPct ?? undefined,
        marginPct: marginPct ?? undefined,
        breakevenPrice: breakevenPrice ?? undefined,
        fbaFee: fbaFee ?? undefined,
        referralFee: referralFee ?? undefined,
        inventoryValue: inventoryValue ?? undefined,
        reorderStatus: reorderStatus as never,
        listingStatus: listingStatus as never,
        preferredSupplierId: bestSupplierId ?? undefined,
      },
    }),
    client.reorderRecommendation.updateMany({ where: { productId, isLatest: true }, data: { isLatest: false } }),
    client.reorderRecommendation.create({
      data: {
        productId,
        bsr: product.bsr,
        t30Sales: t30,
        t60Sales: t60,
        t60IsEstimated,
        avgDailySales: avgDaily,
        amazonQty,
        roverQty,
        officeQty,
        incomingQty,
        netAvailable: rec30.netAvailable,
        daysOfStock: days ?? undefined,
        stockStatus,
        targetDemand30: target30,
        recommendedQty30: rec30.recommendedQty,
        targetDemand60: target60,
        recommendedQty60: rec60.recommendedQty,
        priority: priority as never,
        reorderStatus: reorderStatus as never,
        bestSupplierId,
        bestSupplierPrice,
        expectedProfitPerUnit,
        expectedRoiPct,
        breakdown: JSON.parse(
          JSON.stringify({
            coverage30: rec30,
            coverage60: rec60,
            t60IsEstimated,
            settingsSnapshot: pickRelevantSettings(settings),
          })
        ),
        isLatest: true,
      },
    }),
  ]);

  const evaluatedOffers = sellingPrice != null ? evaluateOffers(offers, sellingPrice, Math.max(rec30.recommendedQty, 1), settings, fbaFee) : [];
  await evaluateProductAlerts(
    {
      productId,
      title: product.title,
      asin: product.asin,
      primaryBarcode: product.primaryBarcode,
      isActive: product.isActive,
      amazonAvailableQty: amazonQty,
      roverQty,
      officeQty,
      t30Sales: t30,
      bsr: product.bsr,
      stockStatus,
      daysOfStock: days,
      reorderStatus,
      profitStatus,
      roiPct,
      currentCost: cost,
      target30: target30,
      bestSupplierId,
      bestSupplierPrice,
      offers: evaluatedOffers.map((o) => ({
        supplierId: o.supplierId,
        supplierName: o.supplierName,
        price: o.price,
        stockQty: o.stockQty,
        disqualified: o.disqualifiedReasons.length > 0,
      })),
    },
    settings,
    client
  );
}

function pickRelevantSettings(s: BusinessSettings) {
  return {
    priorityBsrThreshold: s.priorityBsrThreshold,
    priorityMinTargetQty: s.priorityMinTargetQty,
    standardRoundingIncrement: s.standardRoundingIncrement,
    includeOfficeStockInAvailability: s.includeOfficeStockInAvailability,
    safetyStockDefault: s.safetyStockDefault,
  };
}

function deriveReorderStatus(params: {
  recommendedQty: number;
  stockStatus: StockStatus;
  hasSupplier: boolean;
  isProfitableToReorder: boolean;
}): string {
  if (params.recommendedQty <= 0) return "NO_REORDER";
  if (!params.isProfitableToReorder) return "NOT_PROFITABLE_TO_REORDER";
  if (!params.hasSupplier) return "SUPPLIER_NOT_FOUND";
  if (params.stockStatus === "OOS" || params.stockStatus === "CRITICAL") return "HIGH_PRIORITY_REORDER";
  if (params.stockStatus === "NEAR_OOS") return "NEAR_OOS";
  return "REORDER_REQUIRED";
}

function deriveListingStatus(params: {
  amazonAvailableQty: number;
  buyBoxPrice: number | null;
  ourPrice: number | null;
  profitStatus: string;
  inbound: number;
  reserved: number;
  unfulfillable: number;
}): string {
  if (params.amazonAvailableQty <= 0) return "OOS";
  if (params.profitStatus === "LOSS") return "SELLING_AT_LOSS";
  if (params.buyBoxPrice != null && params.ourPrice != null) {
    if (Math.abs(params.buyBoxPrice - params.ourPrice) < 0.01) {
      return params.profitStatus === "LOW_PROFIT" ? "BUYBOX_WIN_LOW_PROFIT" : "BUYBOX_WIN";
    }
    return "NO_BUYBOX";
  }
  if (params.unfulfillable > 0) return "UNFULFILLABLE";
  if (params.reserved > 0) return "RESERVED";
  if (params.inbound > 0) return "INBOUND";
  return "UNKNOWN";
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "object" && v !== null && "toNumber" in (v as never) ? (v as { toNumber: () => number }).toNumber() : Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function recomputeAllProducts(client: PrismaClient = defaultPrisma, batchSize = 100) {
  let cursor: string | undefined;
  let processed = 0;
  for (;;) {
    const batch = await client.product.findMany({
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true },
    });
    if (batch.length === 0) break;
    for (const p of batch) {
      await recomputeProduct(p.id, client);
      processed++;
    }
    cursor = batch[batch.length - 1].id;
    if (batch.length < batchSize) break;
  }
  return processed;
}
