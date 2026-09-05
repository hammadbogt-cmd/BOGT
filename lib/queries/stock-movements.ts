import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../prisma";

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && v !== null && "toNumber" in (v as never)) return (v as { toNumber: () => number }).toNumber();
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export interface StockMovementFilters {
  direction?: "IN" | "OUT";
  sourceType?: string;
  locationId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface StockMovementRow {
  id: string;
  date: string;
  productId: string;
  productTitle: string;
  productBarcode: string | null;
  locationCode: string;
  locationName: string;
  direction: string;
  sourceType: string;
  qty: number;
  newCostPrice: number | null;
  supplierName: string | null;
  invoiceId: string | null;
  shipmentReference: string | null;
  remarks: string | null;
}

export interface StockMovementResult {
  rows: StockMovementRow[];
  totalIn: number;
  totalOut: number;
  transactionCount: number;
  locationOptions: { id: string; code: string; name: string }[];
}

export async function getStockMovements(filters: StockMovementFilters, client: PrismaClient = defaultPrisma): Promise<StockMovementResult> {
  const where: Record<string, unknown> = {};
  if (filters.direction) where.direction = filters.direction;
  if (filters.sourceType) where.sourceType = filters.sourceType;
  if (filters.locationId) where.locationId = filters.locationId;
  if (filters.dateFrom || filters.dateTo) {
    where.transactionDate = {
      ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
      ...(filters.dateTo ? { lte: new Date(`${filters.dateTo}T23:59:59.999Z`) } : {}),
    };
  }

  const [txns, locationOptions] = await Promise.all([
    client.inventoryTransaction.findMany({
      where,
      include: {
        product: { select: { title: true, primaryBarcode: true } },
        location: { select: { code: true, name: true } },
        supplier: { select: { name: true } },
      },
      orderBy: { transactionDate: "desc" },
      take: 2000,
    }),
    client.inventoryLocation.findMany({ select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
  ]);

  const rows: StockMovementRow[] = txns.map((t) => ({
    id: t.id,
    date: t.transactionDate.toISOString(),
    productId: t.productId,
    productTitle: t.product.title,
    productBarcode: t.product.primaryBarcode,
    locationCode: t.location.code,
    locationName: t.location.name,
    direction: t.direction,
    sourceType: t.sourceType,
    qty: t.qty,
    newCostPrice: num(t.newCostPrice),
    supplierName: t.supplier?.name ?? null,
    invoiceId: t.invoiceId,
    shipmentReference: t.shipmentReference,
    remarks: t.remarks,
  }));

  return {
    rows,
    totalIn: rows.filter((r) => r.direction === "IN").reduce((s, r) => s + r.qty, 0),
    totalOut: rows.filter((r) => r.direction === "OUT").reduce((s, r) => s + r.qty, 0),
    transactionCount: rows.length,
    locationOptions,
  };
}
