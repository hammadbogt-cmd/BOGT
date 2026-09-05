import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../prisma";
import { getSettings } from "../settings-store";
import { pickBestSupplier, type SupplierOffer } from "../calc/supplier";

export interface SupplierComparisonRow {
  productId: string;
  title: string;
  brand: string | null;
  primaryBarcode: string | null;
  sellingPrice: number | null;
  supplierId: string;
  supplierName: string;
  price: number;
  stockQty: number | null;
  moq: number | null;
  leadTimeDays: number | null;
  profit: number | null;
  roiPct: number | null;
  isCheapest: boolean;
  isRecommended: boolean;
  disqualifiedReasons: string[];
  offerCount: number;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && v !== null && "toNumber" in (v as never)) return (v as { toNumber: () => number }).toNumber();
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export interface SupplierComparisonFilters {
  supplierId?: string;
  onlyMultiSupplier?: boolean;
}

/**
 * Cross-supplier price comparison (spec section 19): every product that has
 * at least one active supplier offer, flattened to one row per offer so the
 * table can show — for the SAME product — every supplier's price side by
 * side, with the cheapest offer and the actually-recommended offer marked
 * separately. They are frequently NOT the same row (out of stock, below MOQ,
 * long lead time, or loss-making all disqualify a cheaper price from being
 * the recommendation).
 */
export async function getSupplierComparisonRows(
  filters: SupplierComparisonFilters,
  client: PrismaClient = defaultPrisma
): Promise<SupplierComparisonRow[]> {
  const settings = await getSettings(client);

  const products = await client.product.findMany({
    where: {
      isActive: true,
      supplierProducts: {
        some: { isActive: true, ...(filters.supplierId ? { supplierId: filters.supplierId } : {}) },
      },
    },
    include: {
      supplierProducts: { where: { isActive: true }, include: { supplier: true } },
      reorderRecs: { where: { isLatest: true }, select: { recommendedQty30: true } },
    },
  });

  const rows: SupplierComparisonRow[] = [];

  for (const product of products) {
    if (filters.onlyMultiSupplier && product.supplierProducts.length < 2) continue;

    const sellingPrice = num(product.ourPrice) ?? num(product.buyBoxPrice);
    const qtyNeeded = product.reorderRecs[0]?.recommendedQty30 ?? 1;

    const offers: SupplierOffer[] = product.supplierProducts.map((sp) => ({
      supplierId: sp.supplierId,
      supplierName: sp.supplier.name,
      price: num(sp.price) ?? 0,
      stockQty: sp.stockQty,
      moq: sp.moq,
      leadTimeDays: sp.leadTimeDays,
      priorityWeight: sp.supplier.priority,
    }));

    const cheapestPrice = Math.min(...offers.map((o) => o.price));
    const cheapestSupplierIds = new Set(offers.filter((o) => o.price === cheapestPrice).map((o) => o.supplierId));

    let bestSupplierId: string | null = null;
    let evaluated = offers.map((o) => ({ ...o, profit: null as number | null, roiPct: null as number | null, disqualifiedReasons: [] as string[] }));

    if (sellingPrice != null) {
      const result = pickBestSupplier(offers, sellingPrice, qtyNeeded, settings, num(product.fbaFee));
      bestSupplierId = result.best?.supplierId ?? null;
      evaluated = result.evaluated;
    }

    for (const offer of evaluated) {
      rows.push({
        productId: product.id,
        title: product.title,
        brand: product.brand,
        primaryBarcode: product.primaryBarcode,
        sellingPrice,
        supplierId: offer.supplierId,
        supplierName: offer.supplierName,
        price: offer.price,
        stockQty: offer.stockQty,
        moq: offer.moq,
        leadTimeDays: offer.leadTimeDays,
        profit: offer.profit,
        roiPct: offer.roiPct,
        isCheapest: cheapestSupplierIds.has(offer.supplierId),
        isRecommended: offer.supplierId === bestSupplierId,
        disqualifiedReasons: offer.disqualifiedReasons,
        offerCount: product.supplierProducts.length,
      });
    }
  }

  rows.sort((a, b) => a.title.localeCompare(b.title) || a.price - b.price);
  return rows;
}
