import type { PrismaClient, Product } from "@prisma/client";
import { prisma as defaultPrisma } from "../prisma";
import { getSettings } from "../settings-store";

export type ProductFilter =
  | "loss_making"
  | "low_profit"
  | "fast_moving"
  | "slow_moving"
  | "no_sales"
  | "no_supplier"
  | undefined;

export interface ProductListRow extends Product {
  hasSupplier: boolean;
  stockStatus: string | null;
}

export async function getProductsList(filter: ProductFilter, client: PrismaClient = defaultPrisma): Promise<ProductListRow[]> {
  const settings = await getSettings(client);

  const products = await client.product.findMany({
    include: {
      supplierProducts: { select: { id: true }, take: 1 },
      reorderRecs: { where: { isLatest: true }, select: { stockStatus: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const rows: ProductListRow[] = products.map((p) => ({
    ...p,
    hasSupplier: p.supplierProducts.length > 0,
    stockStatus: p.reorderRecs[0]?.stockStatus ?? null,
  }));

  switch (filter) {
    case "loss_making":
      return rows.filter((p) => p.profitStatus === "LOSS");
    case "low_profit":
      return rows.filter((p) => p.profitStatus === "LOW_PROFIT");
    case "fast_moving":
      return rows.filter((p) => (p.unitsShippedT30 ?? 0) >= settings.highSalesThreshold);
    case "slow_moving":
      return rows.filter((p) => (p.unitsShippedT30 ?? 0) > 0 && (p.unitsShippedT30 ?? 0) < settings.highSalesThreshold / 3);
    case "no_sales":
      return rows.filter((p) => (p.unitsShippedT30 ?? 0) === 0);
    case "no_supplier":
      return rows.filter((p) => !p.hasSupplier);
    default:
      return rows;
  }
}

export const FILTER_LABELS: Record<string, string> = {
  loss_making: "Loss-Making Products",
  low_profit: "Low Profit Products",
  fast_moving: "Fast-Moving Products",
  slow_moving: "Slow-Moving Products",
  no_sales: "Products With No Sales",
  no_supplier: "Products With No Supplier",
};
