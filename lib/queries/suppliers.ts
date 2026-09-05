import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../prisma";

export interface SupplierListRow {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  currency: string;
  leadTimeDays: number | null;
  priority: number;
  isActive: boolean;
  productCount: number;
  purchaseCount: number;
  totalSpend: number;
}

export async function getSuppliersList(client: PrismaClient = defaultPrisma): Promise<SupplierListRow[]> {
  const suppliers = await client.supplier.findMany({
    include: {
      products: { where: { isActive: true }, select: { id: true } },
      _count: { select: { purchasePlanItems: true } },
    },
    orderBy: { priority: "asc" },
  });

  // Purchase history is linked by supplierId OR by matching supplierName text
  // (older imported rows only carry the name) — sum both so "total spend"
  // reflects everything actually attributed to this supplier.
  const spendRows = await client.purchaseHistory.groupBy({
    by: ["supplierId"],
    where: { supplierId: { not: null } },
    _sum: { newCost: true },
    _count: { _all: true },
  });
  const spendBySupplierId = new Map(spendRows.map((r) => [r.supplierId as string, { sum: Number(r._sum.newCost ?? 0), count: r._count._all }]));

  return suppliers.map((s) => {
    const spend = spendBySupplierId.get(s.id);
    return {
      id: s.id,
      name: s.name,
      contactName: s.contactName,
      contactEmail: s.contactEmail,
      contactPhone: s.contactPhone,
      currency: s.currency,
      leadTimeDays: s.leadTimeDays,
      priority: s.priority,
      isActive: s.isActive,
      productCount: s.products.length,
      purchaseCount: spend?.count ?? 0,
      totalSpend: spend?.sum ?? 0,
    };
  });
}

export interface SupplierDetail {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  currency: string;
  moq: number | null;
  casePack: number | null;
  leadTimeDays: number | null;
  priority: number;
  notes: string | null;
  isActive: boolean;
  products: {
    productId: string;
    title: string;
    brand: string | null;
    primaryBarcode: string | null;
    price: string;
    stockQty: number | null;
    moq: number | null;
    leadTimeDays: number | null;
    lastUpdated: string;
    isPreferred: boolean;
  }[];
  purchaseHistory: {
    id: string;
    date: string;
    invoiceId: string | null;
    productTitle: string;
    qty: number;
    newCost: string;
  }[];
  totalSpend: number;
}

export async function getSupplierDetail(id: string, client: PrismaClient = defaultPrisma): Promise<SupplierDetail | null> {
  const supplier = await client.supplier.findUnique({
    where: { id },
    include: {
      products: {
        where: { isActive: true },
        include: { product: { select: { id: true, title: true, brand: true, primaryBarcode: true, preferredSupplierId: true } } },
        orderBy: { lastUpdated: "desc" },
      },
    },
  });
  if (!supplier) return null;

  const purchaseHistory = await client.purchaseHistory.findMany({
    where: { supplierId: id },
    include: { product: { select: { title: true } } },
    orderBy: { date: "desc" },
    take: 100,
  });

  const totalSpend = purchaseHistory.reduce((sum, p) => sum + Number(p.newCost) * p.qty, 0);

  return {
    id: supplier.id,
    name: supplier.name,
    contactName: supplier.contactName,
    contactEmail: supplier.contactEmail,
    contactPhone: supplier.contactPhone,
    currency: supplier.currency,
    moq: supplier.moq,
    casePack: supplier.casePack,
    leadTimeDays: supplier.leadTimeDays,
    priority: supplier.priority,
    notes: supplier.notes,
    isActive: supplier.isActive,
    products: supplier.products.map((sp) => ({
      productId: sp.productId,
      title: sp.product.title,
      brand: sp.product.brand,
      primaryBarcode: sp.product.primaryBarcode,
      price: sp.price.toString(),
      stockQty: sp.stockQty,
      moq: sp.moq,
      leadTimeDays: sp.leadTimeDays,
      lastUpdated: sp.lastUpdated.toISOString(),
      isPreferred: sp.product.preferredSupplierId === supplier.id,
    })),
    purchaseHistory: purchaseHistory.map((p) => ({
      id: p.id,
      date: p.date.toISOString(),
      invoiceId: p.invoiceId,
      productTitle: p.product.title,
      qty: p.qty,
      newCost: p.newCost.toString(),
    })),
    totalSpend,
  };
}
