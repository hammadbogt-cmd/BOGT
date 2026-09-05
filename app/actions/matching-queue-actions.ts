"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../lib/prisma";
import { requirePermission } from "../../lib/auth/current-user";
import { recordAudit } from "../../lib/audit";
import { registerIdentifier } from "../../lib/matching/match-product";
import { recomputeProduct } from "../../lib/engine/recompute";
import { classifyInvoiceLine } from "../../lib/calc/invoice";
import { getSettings } from "../../lib/settings-store";
import { searchProductsForMatching, type ProductSearchResult } from "../../lib/queries/matching-queue";

export async function searchProductsAction(query: string): Promise<ProductSearchResult[]> {
  await requirePermission("review_matching_queue");
  return searchProductsForMatching(query);
}

export interface MatchingQueueActionState {
  success?: boolean;
  error?: string;
  note?: string;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && v !== null && "toNumber" in (v as never)) return (v as { toNumber: () => number }).toNumber();
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Confirms a Matching Review entry against a chosen product. Always
 * registers whatever identifier the row carried (barcode/ASIN/SKU) so future
 * imports auto-match instead of piling up in this queue again, then — for
 * candidate types we know how to fully replay — finishes what the original
 * import couldn't (creating the SupplierProduct offer, or re-classifying the
 * invoice line now that a product is known).
 */
export async function confirmMatchAction(_prev: MatchingQueueActionState, formData: FormData): Promise<MatchingQueueActionState> {
  try {
    const user = await requirePermission("review_matching_queue");
    const entryId = String(formData.get("entryId"));
    const productId = String(formData.get("productId"));
    if (!productId) return { error: "Choose a product to link this to first." };

    const entry = await prisma.matchingQueue.findUniqueOrThrow({ where: { id: entryId } });
    if (entry.status !== "PENDING") return { error: `This entry is already ${entry.status}.` };

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return { error: "That product no longer exists." };

    const metadata = (entry.metadata as Record<string, unknown> | null) ?? {};
    const barcode = (metadata.barcode as string | undefined) ?? (entry.rawIdentifier && /^\d{6,}$/.test(entry.rawIdentifier) ? entry.rawIdentifier : undefined);
    const asin = metadata.asin as string | undefined;
    const sku = metadata.sku as string | undefined;

    if (barcode) await registerIdentifier(prisma, productId, "BARCODE_ALTERNATE", barcode, "matching_review");
    if (asin) await registerIdentifier(prisma, productId, "ASIN", asin, "matching_review");
    if (sku) await registerIdentifier(prisma, productId, "SUPPLIER_SKU", sku, "matching_review");

    let note = "Identifier registered for future matches.";

    if (entry.candidateType === "supplier_upload" && metadata.supplierId && metadata.price != null) {
      const supplierId = String(metadata.supplierId);
      const price = Number(metadata.price);
      const existing = await prisma.supplierProduct.findUnique({ where: { supplierId_productId: { supplierId, productId } } });
      if (!existing) {
        const created = await prisma.supplierProduct.create({
          data: {
            supplierId,
            productId,
            price,
            stockQty: (metadata.stockQty as number | null) ?? undefined,
            moq: (metadata.moq as number | null) ?? undefined,
            leadTimeDays: (metadata.leadTimeDays as number | null) ?? undefined,
            casePack: (metadata.casePack as number | null) ?? undefined,
          },
        });
        await prisma.supplierPriceHistory.create({ data: { supplierProductId: created.id, price, source: "matching_review" } });
      } else {
        await prisma.supplierProduct.update({ where: { id: existing.id }, data: { price, isActive: true, lastUpdated: new Date() } });
      }
      await recomputeProduct(productId);
      note = "Supplier offer created and product recomputed.";
    } else if (entry.candidateType === "invoice_upload" && metadata.invoiceItemId) {
      const settings = await getSettings();
      const activeOffers = await prisma.supplierProduct.findMany({ where: { productId, isActive: true } });
      const bestCurrentSupplierPrice = activeOffers.length > 0 ? Math.min(...activeOffers.map((o) => Number(o.price))) : null;
      const sellingPrice = product.ourPrice != null ? Number(product.ourPrice) : product.buyBoxPrice != null ? Number(product.buyBoxPrice) : null;
      const invoicePrice = Number(metadata.price);
      const invoiceQty = Number(metadata.qty);

      const classified = classifyInvoiceLine(
        {
          matched: true,
          matchedByBarcode: !!barcode,
          invoicePrice,
          invoiceQty,
          lastPurchasePrice: num(product.lastPurchaseCost),
          currentMasterCost: num(product.currentCost),
          weightedAvgPrice: num(product.weightedAvgCost),
          lowestHistoricalPrice: num(product.lowestHistoricalCost),
          bestCurrentSupplierPrice,
          currentSellingPrice: sellingPrice,
          fbaFee: num(product.fbaFee),
        },
        settings
      );

      await prisma.invoiceItem.update({
        where: { id: String(metadata.invoiceItemId) },
        data: {
          productId,
          lastPurchasePrice: product.lastPurchaseCost ?? undefined,
          weightedAvgPrice: product.weightedAvgCost ?? undefined,
          lowestHistoricalPrice: product.lowestHistoricalCost ?? undefined,
          currentMasterCost: product.currentCost ?? undefined,
          bestCurrentSupplierPrice: bestCurrentSupplierPrice ?? undefined,
          priceDiff: classified.priceDiff ?? undefined,
          priceDiffPct: classified.priceDiffPct ?? undefined,
          currentSellingPrice: sellingPrice ?? undefined,
          estFbaFee: product.fbaFee ?? undefined,
          profit: classified.profit ?? undefined,
          roiPct: classified.roiPct ?? undefined,
          status: classified.primaryStatus as never,
        },
      });
      note = `Invoice line re-classified as ${classified.primaryStatus}.`;
    }

    await prisma.matchingQueue.update({
      where: { id: entryId },
      data: { status: "CONFIRMED", suggestedProductId: productId, reviewedById: user.id, reviewedAt: new Date() },
    });

    await recordAudit({
      userId: user.id,
      action: "CONFIRM_MATCHING_QUEUE_ENTRY",
      entityType: "MatchingQueue",
      entityId: entryId,
      newValue: { productId, candidateType: entry.candidateType },
      source: "ui",
    });

    revalidatePath("/matching-review");
    revalidatePath("/suppliers");
    revalidatePath("/invoices");
    revalidatePath("/reorder-center");
    return { success: true, note };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function rejectMatchAction(_prev: MatchingQueueActionState, formData: FormData): Promise<MatchingQueueActionState> {
  try {
    const user = await requirePermission("review_matching_queue");
    const entryId = String(formData.get("entryId"));
    const entry = await prisma.matchingQueue.findUniqueOrThrow({ where: { id: entryId } });
    if (entry.status !== "PENDING") return { error: `This entry is already ${entry.status}.` };

    await prisma.matchingQueue.update({
      where: { id: entryId },
      data: { status: "REJECTED", reviewedById: user.id, reviewedAt: new Date() },
    });

    await recordAudit({ userId: user.id, action: "REJECT_MATCHING_QUEUE_ENTRY", entityType: "MatchingQueue", entityId: entryId, source: "ui" });
    revalidatePath("/matching-review");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
