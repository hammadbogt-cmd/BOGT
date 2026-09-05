import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../prisma";
import { getSettings } from "../settings-store";

export interface ReorderCenterFilters {
  priority?: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reorderStatus?: string;
  stockStatus?: string;
  includeNoReorder?: boolean;
}

export interface ReorderCenterRow {
  productId: string;
  title: string;
  brand: string | null;
  primaryBarcode: string | null;
  asin: string | null;
  bsr: number | null;
  t30Sales: number | null;
  t60Sales: number | null;
  t60IsEstimated: boolean;
  daysOfStock: string | null;
  stockStatus: string | null;
  amazonQty: number;
  roverQty: number;
  officeQty: number;
  incomingQty: number;
  netAvailable: number;
  targetDemand30: number;
  recommendedQty30: number;
  targetDemand60: number;
  recommendedQty60: number;
  priority: string;
  reorderStatus: string;
  bestSupplierId: string | null;
  bestSupplierName: string | null;
  bestSupplierPrice: string | null;
  expectedProfitPerUnit: string | null;
  expectedRoiPct: string | null;
  breakdown: unknown;
  alreadyOnQuickList: boolean;
}

const PRIORITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, NONE: 4 };

/**
 * Reorder Center (spec sections 11 & 20): every product's current 30/60-day
 * recommendation with full transparency, ready for bulk action. Defaults to
 * hiding NO_REORDER rows (nothing to do) unless explicitly requested.
 */
export async function getReorderCenterRows(
  filters: ReorderCenterFilters,
  client: PrismaClient = defaultPrisma
): Promise<ReorderCenterRow[]> {
  await getSettings(client); // ensures settings row exists; recs already carry their own snapshot

  const recs = await client.reorderRecommendation.findMany({
    where: {
      isLatest: true,
      ...(filters.priority ? { priority: filters.priority } : {}),
      ...(filters.reorderStatus ? { reorderStatus: filters.reorderStatus as never } : {}),
      ...(filters.stockStatus ? { stockStatus: filters.stockStatus } : {}),
      ...(filters.includeNoReorder ? {} : { recommendedQty30: { gt: 0 } }),
    },
    include: {
      product: { select: { title: true, brand: true, primaryBarcode: true, asin: true, isActive: true } },
    },
  });

  const active = recs.filter((r) => r.product.isActive);

  const supplierIds = [...new Set(active.map((r) => r.bestSupplierId).filter((v): v is string => !!v))];
  const suppliers = supplierIds.length
    ? await client.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, name: true } })
    : [];
  const supplierNameById = new Map(suppliers.map((s) => [s.id, s.name]));

  const productIds = active.map((r) => r.productId);
  const quickListItems = productIds.length
    ? await client.purchasePlanItem.findMany({
        where: { productId: { in: productIds }, plan: { name: "Quick Reorder List", status: "DRAFT" } },
        select: { productId: true },
      })
    : [];
  const onQuickList = new Set(quickListItems.map((i) => i.productId));

  const rows: ReorderCenterRow[] = active.map((r) => ({
    productId: r.productId,
    title: r.product.title,
    brand: r.product.brand,
    primaryBarcode: r.product.primaryBarcode,
    asin: r.product.asin,
    bsr: r.bsr,
    t30Sales: r.t30Sales,
    t60Sales: r.t60Sales,
    t60IsEstimated: r.t60IsEstimated,
    daysOfStock: r.daysOfStock?.toString() ?? null,
    stockStatus: r.stockStatus,
    amazonQty: r.amazonQty,
    roverQty: r.roverQty,
    officeQty: r.officeQty,
    incomingQty: r.incomingQty,
    netAvailable: r.netAvailable,
    targetDemand30: r.targetDemand30,
    recommendedQty30: r.recommendedQty30,
    targetDemand60: r.targetDemand60,
    recommendedQty60: r.recommendedQty60,
    priority: r.priority,
    reorderStatus: r.reorderStatus,
    bestSupplierId: r.bestSupplierId,
    bestSupplierName: r.bestSupplierId ? supplierNameById.get(r.bestSupplierId) ?? null : null,
    bestSupplierPrice: r.bestSupplierPrice?.toString() ?? null,
    expectedProfitPerUnit: r.expectedProfitPerUnit?.toString() ?? null,
    expectedRoiPct: r.expectedRoiPct?.toString() ?? null,
    breakdown: r.breakdown,
    alreadyOnQuickList: onQuickList.has(r.productId),
  }));

  rows.sort((a, b) => {
    const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (pr !== 0) return pr;
    const da = a.daysOfStock != null ? Number(a.daysOfStock) : Number.MAX_SAFE_INTEGER;
    const db = b.daysOfStock != null ? Number(b.daysOfStock) : Number.MAX_SAFE_INTEGER;
    return da - db;
  });

  return rows;
}
