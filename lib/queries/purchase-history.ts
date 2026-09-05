import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../prisma";

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && v !== null && "toNumber" in (v as never)) return (v as { toNumber: () => number }).toNumber();
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export interface PurchaseHistoryFilters {
  supplierId?: string;
  productId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface PurchaseHistoryRow {
  id: string;
  date: string;
  productId: string;
  productTitle: string;
  productBarcode: string | null;
  supplierId: string | null;
  supplierName: string | null;
  qty: number;
  newCost: number;
  previousCost: number | null;
  priceDiff: number | null;
  priceDiffPct: number | null;
  lineTotal: number;
  invoiceId: string | null;
  source: string | null;
}

export interface PurchaseHistoryResult {
  rows: PurchaseHistoryRow[];
  totalSpend: number;
  totalUnits: number;
  transactionCount: number;
  supplierOptions: { id: string; name: string }[];
}

export async function getPurchaseHistory(filters: PurchaseHistoryFilters, client: PrismaClient = defaultPrisma): Promise<PurchaseHistoryResult> {
  const where: Record<string, unknown> = {};
  if (filters.supplierId) where.supplierId = filters.supplierId;
  if (filters.productId) where.productId = filters.productId;
  if (filters.dateFrom || filters.dateTo) {
    where.date = {
      ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
      ...(filters.dateTo ? { lte: new Date(`${filters.dateTo}T23:59:59.999Z`) } : {}),
    };
  }

  const [history, supplierOptions] = await Promise.all([
    client.purchaseHistory.findMany({
      where,
      include: { product: { select: { title: true, primaryBarcode: true } } },
      orderBy: { date: "desc" },
      take: 2000,
    }),
    client.supplier.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const supplierNameById = new Map(supplierOptions.map((s) => [s.id, s.name]));

  const rows: PurchaseHistoryRow[] = history.map((h) => {
    const newCost = num(h.newCost) ?? 0;
    return {
      id: h.id,
      date: h.date.toISOString(),
      productId: h.productId,
      productTitle: h.product.title,
      productBarcode: h.product.primaryBarcode,
      supplierId: h.supplierId,
      supplierName: (h.supplierId ? supplierNameById.get(h.supplierId) : null) ?? h.supplierName,
      qty: h.qty,
      newCost,
      previousCost: num(h.previousCost),
      priceDiff: num(h.priceDiff),
      priceDiffPct: num(h.priceDiffPct),
      lineTotal: newCost * h.qty,
      invoiceId: h.invoiceId,
      source: h.source,
    };
  });

  return {
    rows,
    totalSpend: rows.reduce((s, r) => s + r.lineTotal, 0),
    totalUnits: rows.reduce((s, r) => s + r.qty, 0),
    transactionCount: rows.length,
    supplierOptions,
  };
}
