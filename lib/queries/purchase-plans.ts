import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../prisma";

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && v !== null && "toNumber" in (v as never)) return (v as { toNumber: () => number }).toNumber();
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export interface PurchasePlanListRow {
  id: string;
  name: string;
  status: string;
  itemCount: number;
  totalExpectedCost: number;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function getPurchasePlansList(client: PrismaClient = defaultPrisma): Promise<PurchasePlanListRow[]> {
  const plans = await client.purchasePlan.findMany({
    include: { items: { select: { expectedTotalCost: true } }, createdBy: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return plans.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    itemCount: p.items.length,
    totalExpectedCost: p.items.reduce((sum, i) => sum + (num(i.expectedTotalCost) ?? 0), 0),
    createdByName: p.createdBy?.name ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));
}

export interface PurchasePlanItemRow {
  id: string;
  productId: string;
  productTitle: string;
  productBarcode: string | null;
  supplierId: string | null;
  supplierName: string | null;
  systemRecommendedQty: number;
  userFinalQty: number | null;
  supplierStockQty: number | null;
  supplierPrice: number | null;
  expectedTotalCost: number | null;
  expectedProfit: number | null;
  roiPct: number | null;
  notes: string | null;
  status: string;
  availableSuppliers: { supplierId: string; supplierName: string; price: number; stockQty: number | null }[];
}

export interface PurchasePlanDetail {
  id: string;
  name: string;
  status: string;
  createdByName: string | null;
  createdAt: string;
  items: PurchasePlanItemRow[];
}

export async function getPurchasePlanDetail(id: string, client: PrismaClient = defaultPrisma): Promise<PurchasePlanDetail | null> {
  const plan = await client.purchasePlan.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      items: {
        include: {
          product: {
            select: {
              title: true,
              primaryBarcode: true,
              supplierProducts: { where: { isActive: true }, include: { supplier: { select: { id: true, name: true } } } },
            },
          },
          supplier: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!plan) return null;

  return {
    id: plan.id,
    name: plan.name,
    status: plan.status,
    createdByName: plan.createdBy?.name ?? null,
    createdAt: plan.createdAt.toISOString(),
    items: plan.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      productTitle: i.product.title,
      productBarcode: i.product.primaryBarcode,
      supplierId: i.supplierId,
      supplierName: i.supplier?.name ?? null,
      systemRecommendedQty: i.systemRecommendedQty,
      userFinalQty: i.userFinalQty,
      supplierStockQty: i.supplierStockQty,
      supplierPrice: num(i.supplierPrice),
      expectedTotalCost: num(i.expectedTotalCost),
      expectedProfit: num(i.expectedProfit),
      roiPct: num(i.roiPct),
      notes: i.notes,
      status: i.status,
      availableSuppliers: i.product.supplierProducts.map((sp) => ({
        supplierId: sp.supplier.id,
        supplierName: sp.supplier.name,
        price: num(sp.price) ?? 0,
        stockQty: sp.stockQty,
      })),
    })),
  };
}
