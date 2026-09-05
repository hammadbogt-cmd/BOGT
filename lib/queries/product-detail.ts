import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../prisma";
import { getSettings } from "../settings-store";
import { pickBestSupplier, evaluateOffers } from "../calc/supplier";
import { calculateProfit } from "../calc/profitability";

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "toNumber" in (v as never)) return (v as { toNumber: () => number }).toNumber();
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function getProductDetail(productId: string, client: PrismaClient = defaultPrisma) {
  const settings = await getSettings(client);

  const product = await client.product.findUnique({
    where: { id: productId },
    include: {
      identifiers: true,
      supplierProducts: { where: { isActive: true }, include: { supplier: true } },
      reorderRecs: { where: { isLatest: true }, take: 1 },
    },
  });
  if (!product) return null;

  const [purchaseHistory, rawTransactions] = await Promise.all([
    client.purchaseHistory.findMany({ where: { productId }, orderBy: { date: "desc" } }),
    client.inventoryTransaction.findMany({
      where: { productId },
      include: { location: true },
      orderBy: { transactionDate: "desc" },
      take: 100,
    }),
  ]);

  // Stock Movement History with a running-total narrative (spec section 16).
  // NOTE: this walks the fetched window (up to the most recent 100 movements
  // per product) forward chronologically, accumulating from zero — it is a
  // *relative* net-units-moved counter for the movements actually shown, not
  // a reconstruction of absolute physical balance. Anchoring to the product's
  // current denormalized qty and walking backward would silently assume every
  // unit of that balance is explained by transactions in this window, which
  // is not guaranteed (opening balances, older history beyond the window, or
  // manual adjustments can all account for stock the ledger here doesn't
  // cover) and can produce a physically-impossible negative "balance before".
  // The live physical balance for each location is shown in the Warehouse
  // Position / Amazon Position cards above, sourced from current state.
  const runningQtyByLocation: Record<string, number> = {};
  const chronological = [...rawTransactions].sort(
    (a, b) => a.transactionDate.getTime() - b.transactionDate.getTime()
  );
  const runningById = new Map<string, { runningTotalBefore: number; runningTotalAfter: number }>();
  for (const txn of chronological) {
    const code = txn.location.code;
    const before = runningQtyByLocation[code] ?? 0;
    const after = txn.direction === "IN" ? before + txn.qty : before - txn.qty;
    runningQtyByLocation[code] = after;
    runningById.set(txn.id, { runningTotalBefore: before, runningTotalAfter: after });
  }
  const transactions = rawTransactions.map((txn) => ({ ...txn, ...runningById.get(txn.id)! }));

  const rec = product.reorderRecs[0] ?? null;

  const sellingPrice = num(product.ourPrice) ?? num(product.buyBoxPrice);
  const currentCost = num(product.currentCost);

  const offers = product.supplierProducts.map((sp) => ({
    supplierId: sp.supplierId,
    supplierName: sp.supplier.name,
    price: num(sp.price) ?? 0,
    stockQty: sp.stockQty,
    moq: sp.moq,
    leadTimeDays: sp.leadTimeDays,
    priorityWeight: sp.supplier.priority,
  }));

  const evaluatedOffers =
    sellingPrice != null
      ? evaluateOffers(offers, sellingPrice, rec?.recommendedQty30 ?? 1, settings, num(product.fbaFee))
      : [];

  const bestSupplier =
    sellingPrice != null && offers.length > 0
      ? pickBestSupplier(offers, sellingPrice, rec?.recommendedQty30 ?? 1, settings, num(product.fbaFee)).best
      : null;

  const profitAtCurrentCost =
    sellingPrice != null && currentCost != null
      ? calculateProfit({ sellingPrice, purchaseCost: currentCost, fbaFee: num(product.fbaFee) }, settings)
      : null;

  // Purchase history rollup stats (spec section 15)
  const purchaseCosts = purchaseHistory.map((p) => num(p.newCost) ?? 0);
  const purchaseStats =
    purchaseHistory.length > 0
      ? {
          count: purchaseHistory.length,
          totalUnits: purchaseHistory.reduce((s, p) => s + p.qty, 0),
          firstPurchase: purchaseHistory[purchaseHistory.length - 1].date,
          lastPurchase: purchaseHistory[0].date,
          lowestCost: Math.min(...purchaseCosts),
          highestCost: Math.max(...purchaseCosts),
          averageCost: purchaseCosts.reduce((s, c) => s + c, 0) / purchaseCosts.length,
          supplierCounts: purchaseHistory.reduce<Record<string, number>>((acc, p) => {
            const key = p.supplierName ?? "Unknown";
            acc[key] = (acc[key] ?? 0) + 1;
            return acc;
          }, {}),
        }
      : null;

  const mostUsedSupplier = purchaseStats
    ? Object.entries(purchaseStats.supplierCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    : null;

  return {
    product,
    reorderRec: rec,
    purchaseHistory,
    purchaseStats,
    mostUsedSupplier,
    transactions,
    evaluatedOffers,
    bestSupplier,
    profitAtCurrentCost,
    settings,
  };
}

export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProductDetail>>>;
