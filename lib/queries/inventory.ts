import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../prisma";

export type StockStatusFilter = "OOS" | "CRITICAL" | "NEAR_OOS" | "LOW_STOCK" | "HEALTHY" | undefined;

export interface AmazonInventoryRow {
  id: string;
  title: string;
  brand: string | null;
  primaryBarcode: string | null;
  asin: string | null;
  amazonSku: string | null;
  bsr: number | null;
  unitsShippedT30: number | null;
  amazonAvailableQty: number;
  amazonReservedQty: number;
  amazonInboundQty: number;
  amazonUnfulfillableQty: number;
  buyBoxPrice: string | null;
  ourPrice: string | null;
  listingStatus: string;
  profitStatus: string;
  stockStatus: string | null;
  inventoryValue: string | null;
}

/** Amazon Inventory list (spec section 37 nav: Inventory > Amazon Inventory) — Amazon-side position only. */
export async function getAmazonInventory(
  statusFilter: StockStatusFilter,
  client: PrismaClient = defaultPrisma
): Promise<AmazonInventoryRow[]> {
  const products = await client.product.findMany({
    where: { isActive: true },
    include: { reorderRecs: { where: { isLatest: true }, select: { stockStatus: true } } },
    orderBy: { amazonAvailableQty: "asc" },
  });

  const rows = products.map((p) => ({
    id: p.id,
    title: p.title,
    brand: p.brand,
    primaryBarcode: p.primaryBarcode,
    asin: p.asin,
    amazonSku: p.amazonSku,
    bsr: p.bsr,
    unitsShippedT30: p.unitsShippedT30,
    amazonAvailableQty: p.amazonAvailableQty,
    amazonReservedQty: p.amazonReservedQty,
    amazonInboundQty: p.amazonInboundQty,
    amazonUnfulfillableQty: p.amazonUnfulfillableQty,
    buyBoxPrice: p.buyBoxPrice?.toString() ?? null,
    ourPrice: p.ourPrice?.toString() ?? null,
    listingStatus: p.listingStatus,
    profitStatus: p.profitStatus,
    stockStatus: p.reorderRecs[0]?.stockStatus ?? null,
    inventoryValue: p.inventoryValue?.toString() ?? null,
  }));

  return statusFilter ? rows.filter((r) => r.stockStatus === statusFilter) : rows;
}

export interface WarehouseInventoryRow {
  id: string;
  title: string;
  brand: string | null;
  primaryBarcode: string | null;
  asin: string | null;
  amazonSku: string | null;
  roverQty: number;
  officeQty: number;
  incomingPoQty: number;
  shelfLocation: string | null;
  totalBoxes: number | null;
  qtyPerBox: number | null;
  looseQty: number | null;
  currentCost: string | null;
  inventoryValue: string | null;
  stockStatus: string | null;
  reorderStatus: string;
}

/** Warehouse Inventory list (spec section 37 nav: Inventory > Warehouse Inventory) — Rover + Office physical stock. */
export async function getWarehouseInventory(
  statusFilter: StockStatusFilter,
  client: PrismaClient = defaultPrisma
): Promise<WarehouseInventoryRow[]> {
  const products = await client.product.findMany({
    where: { isActive: true },
    include: { reorderRecs: { where: { isLatest: true }, select: { stockStatus: true } } },
    orderBy: { roverQty: "asc" },
  });

  const rows = products.map((p) => ({
    id: p.id,
    title: p.title,
    brand: p.brand,
    primaryBarcode: p.primaryBarcode,
    asin: p.asin,
    amazonSku: p.amazonSku,
    roverQty: p.roverQty,
    officeQty: p.officeQty,
    incomingPoQty: p.incomingPoQty,
    shelfLocation: p.shelfLocation,
    totalBoxes: p.totalBoxes,
    qtyPerBox: p.qtyPerBox,
    looseQty: p.looseQty,
    currentCost: p.currentCost?.toString() ?? null,
    inventoryValue: p.inventoryValue?.toString() ?? null,
    stockStatus: p.reorderRecs[0]?.stockStatus ?? null,
    reorderStatus: p.reorderStatus,
  }));

  return statusFilter ? rows.filter((r) => r.stockStatus === statusFilter) : rows;
}

export const STOCK_STATUS_LABELS: Record<string, string> = {
  OOS: "Out of Stock",
  CRITICAL: "Critical",
  NEAR_OOS: "Near Out of Stock",
  LOW_STOCK: "Low Stock",
  HEALTHY: "Healthy",
};
