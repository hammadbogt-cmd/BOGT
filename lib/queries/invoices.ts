import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../prisma";

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && v !== null && "toNumber" in (v as never)) return (v as { toNumber: () => number }).toNumber();
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const FLAG_STATUSES = new Set(["LARGE_PRICE_INCREASE", "LOSS", "BETTER_SUPPLIER_AVAILABLE", "UNKNOWN_PRODUCT", "BARCODE_NOT_MATCHED"]);

export interface InvoiceListRow {
  id: string;
  invoiceNumber: string;
  supplierName: string | null;
  status: string;
  invoiceDate: string | null;
  fileName: string | null;
  lineCount: number;
  flaggedCount: number;
  totalAmount: number;
  createdAt: string;
}

export async function getInvoicesList(client: PrismaClient = defaultPrisma): Promise<InvoiceListRow[]> {
  const invoices = await client.invoice.findMany({
    include: { supplier: { select: { name: true } }, items: true },
    orderBy: { createdAt: "desc" },
  });

  return invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    supplierName: inv.supplier?.name ?? null,
    status: inv.status,
    invoiceDate: inv.invoiceDate?.toISOString() ?? null,
    fileName: inv.fileName,
    lineCount: inv.items.length,
    flaggedCount: inv.items.filter((i) => FLAG_STATUSES.has(i.status)).length,
    totalAmount: inv.items.reduce((sum, i) => sum + Number(i.invoicePrice) * i.invoiceQty, 0),
    createdAt: inv.createdAt.toISOString(),
  }));
}

export interface InvoiceLineRow {
  id: string;
  productId: string | null;
  productTitle: string | null;
  titleRaw: string | null;
  barcodeRaw: string | null;
  invoiceQty: number;
  invoicePrice: number;
  referencePrice: number | null;
  referenceSource: string;
  priceDiff: number | null;
  priceDiffPct: number | null;
  bestCurrentSupplierPrice: number | null;
  profit: number | null;
  roiPct: number | null;
  status: string;
}

export interface InvoiceDetail {
  id: string;
  invoiceNumber: string;
  supplierName: string | null;
  status: string;
  invoiceDate: string | null;
  fileName: string | null;
  createdAt: string;
  lines: InvoiceLineRow[];
  totalAmount: number;
}

function referenceSourceFor(item: { lastPurchasePrice: unknown; currentMasterCost: unknown; weightedAvgPrice: unknown; lowestHistoricalPrice: unknown }): string {
  if (item.lastPurchasePrice != null) return "Last Purchase Price";
  if (item.currentMasterCost != null) return "Current Master Cost";
  if (item.weightedAvgPrice != null) return "Weighted Average Cost";
  if (item.lowestHistoricalPrice != null) return "Lowest Historical Cost";
  return "—";
}

function referencePriceFor(item: { lastPurchasePrice: unknown; currentMasterCost: unknown; weightedAvgPrice: unknown; lowestHistoricalPrice: unknown }): number | null {
  if (item.lastPurchasePrice != null) return num(item.lastPurchasePrice);
  if (item.currentMasterCost != null) return num(item.currentMasterCost);
  if (item.weightedAvgPrice != null) return num(item.weightedAvgPrice);
  if (item.lowestHistoricalPrice != null) return num(item.lowestHistoricalPrice);
  return null;
}

export async function getInvoiceDetail(id: string, client: PrismaClient = defaultPrisma): Promise<InvoiceDetail | null> {
  const inv = await client.invoice.findUnique({
    where: { id },
    include: { supplier: { select: { name: true } }, items: { include: { product: { select: { title: true } } } } },
  });
  if (!inv) return null;

  const lines: InvoiceLineRow[] = inv.items.map((i) => ({
    id: i.id,
    productId: i.productId,
    productTitle: i.product?.title ?? null,
    titleRaw: i.titleRaw,
    barcodeRaw: i.barcodeRaw,
    invoiceQty: i.invoiceQty,
    invoicePrice: num(i.invoicePrice) ?? 0,
    referencePrice: referencePriceFor(i),
    referenceSource: referenceSourceFor(i),
    priceDiff: num(i.priceDiff),
    priceDiffPct: num(i.priceDiffPct),
    bestCurrentSupplierPrice: num(i.bestCurrentSupplierPrice),
    profit: num(i.profit),
    roiPct: num(i.roiPct),
    status: i.status,
  }));

  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    supplierName: inv.supplier?.name ?? null,
    status: inv.status,
    invoiceDate: inv.invoiceDate?.toISOString() ?? null,
    fileName: inv.fileName,
    createdAt: inv.createdAt.toISOString(),
    lines,
    totalAmount: lines.reduce((sum, l) => sum + l.invoicePrice * l.invoiceQty, 0),
  };
}
