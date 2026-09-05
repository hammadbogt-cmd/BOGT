import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../prisma";

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && v !== null && "toNumber" in (v as never)) return (v as { toNumber: () => number }).toNumber();
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export interface PurchaseOrderListRow {
  id: string;
  poNumber: string;
  supplierName: string;
  status: string;
  orderDate: string;
  expectedDelivery: string | null;
  itemCount: number;
  totalExpected: number;
  totalReceivedQty: number;
  totalOrderedQty: number;
}

export async function getPurchaseOrdersList(statusFilter: string | undefined, client: PrismaClient = defaultPrisma): Promise<PurchaseOrderListRow[]> {
  const orders = await client.purchaseOrder.findMany({
    where: statusFilter ? { status: statusFilter as never } : undefined,
    include: { supplier: { select: { name: true } }, items: true },
    orderBy: { orderDate: "desc" },
  });

  return orders.map((po) => ({
    id: po.id,
    poNumber: po.poNumber,
    supplierName: po.supplier.name,
    status: po.status,
    orderDate: po.orderDate.toISOString(),
    expectedDelivery: po.expectedDelivery?.toISOString() ?? null,
    itemCount: po.items.length,
    totalExpected: po.items.reduce((sum, i) => sum + (num(i.expectedTotal) ?? 0), 0),
    totalReceivedQty: po.items.reduce((sum, i) => sum + i.receivedQty, 0),
    totalOrderedQty: po.items.reduce((sum, i) => sum + i.qtyOrdered, 0),
  }));
}

export interface PurchaseOrderItemRow {
  id: string;
  productId: string;
  productTitle: string;
  productBarcode: string | null;
  qtyOrdered: number;
  unitCost: number;
  expectedTotal: number;
  receivedQty: number;
}

export interface PurchaseOrderDetail {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  status: string;
  orderDate: string;
  expectedDelivery: string | null;
  invoiceReference: string | null;
  createdByName: string | null;
  items: PurchaseOrderItemRow[];
}

export async function getPurchaseOrderDetail(id: string, client: PrismaClient = defaultPrisma): Promise<PurchaseOrderDetail | null> {
  const po = await client.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: { select: { name: true } },
      createdBy: { select: { name: true } },
      items: { include: { product: { select: { title: true, primaryBarcode: true } } } },
    },
  });
  if (!po) return null;

  return {
    id: po.id,
    poNumber: po.poNumber,
    supplierId: po.supplierId,
    supplierName: po.supplier.name,
    status: po.status,
    orderDate: po.orderDate.toISOString(),
    expectedDelivery: po.expectedDelivery?.toISOString() ?? null,
    invoiceReference: po.invoiceReference,
    createdByName: po.createdBy?.name ?? null,
    items: po.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      productTitle: i.product.title,
      productBarcode: i.product.primaryBarcode,
      qtyOrdered: i.qtyOrdered,
      unitCost: num(i.unitCost) ?? 0,
      expectedTotal: num(i.expectedTotal) ?? 0,
      receivedQty: i.receivedQty,
    })),
  };
}
