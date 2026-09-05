"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../lib/prisma";
import { requirePermission } from "../../lib/auth/current-user";
import { recordAudit } from "../../lib/audit";

export interface AddToReorderState {
  success?: boolean;
  error?: string;
}

const QUICK_LIST_NAME = "Quick Reorder List";

/** The "ADD TO REORDER" button on Product 360 and the Reorder Center (spec sections 11, 20, 39). */
export async function addToReorderAction(_prev: AddToReorderState, formData: FormData): Promise<AddToReorderState> {
  try {
    const user = await requirePermission("create_purchase_plans");
    const productId = String(formData.get("productId"));
    const supplierId = formData.get("supplierId") ? String(formData.get("supplierId")) : null;
    const recommendedQty = Number(formData.get("recommendedQty") ?? 0);
    const supplierPrice = formData.get("supplierPrice") ? Number(formData.get("supplierPrice")) : null;

    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });

    let plan = await prisma.purchasePlan.findFirst({ where: { name: QUICK_LIST_NAME, status: "DRAFT" } });
    if (!plan) {
      plan = await prisma.purchasePlan.create({ data: { name: QUICK_LIST_NAME, status: "DRAFT", createdById: user.id } });
    }

    const existingItem = await prisma.purchasePlanItem.findFirst({ where: { planId: plan.id, productId } });
    if (existingItem) {
      return { error: `"${product.title}" is already on the Quick Reorder List.` };
    }

    const expectedTotalCost = supplierPrice != null ? supplierPrice * recommendedQty : null;

    const item = await prisma.purchasePlanItem.create({
      data: {
        planId: plan.id,
        productId,
        supplierId: supplierId ?? undefined,
        systemRecommendedQty: recommendedQty,
        supplierPrice: supplierPrice ?? undefined,
        expectedTotalCost: expectedTotalCost ?? undefined,
        status: "SUGGESTED",
      },
    });

    await recordAudit({
      userId: user.id,
      action: "ADD_TO_REORDER",
      entityType: "PurchasePlanItem",
      entityId: item.id,
      newValue: { productId, recommendedQty, supplierId, supplierPrice },
      source: "ui",
    });

    revalidatePath("/purchase-plans");
    revalidatePath("/reorder-center");
    revalidatePath(`/products/${productId}`);

    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export interface BulkAddToReorderState {
  added?: number;
  alreadyOnList?: number;
  skipped?: number;
  error?: string;
}

/**
 * Bulk "Add Selected to Reorder" from the Reorder Center (spec section 20).
 * Recommended qty and best supplier are re-read from the DB server-side
 * (the latest ReorderRecommendation) rather than trusted from the client, so
 * a stale or tampered form can never write a wrong number to a purchase plan.
 */
export async function bulkAddToReorderAction(
  _prev: BulkAddToReorderState,
  formData: FormData
): Promise<BulkAddToReorderState> {
  try {
    const user = await requirePermission("create_purchase_plans");
    const productIds = formData.getAll("productIds").map(String).filter(Boolean);
    if (productIds.length === 0) {
      return { error: "Select at least one product first." };
    }

    let plan = await prisma.purchasePlan.findFirst({ where: { name: QUICK_LIST_NAME, status: "DRAFT" } });
    if (!plan) {
      plan = await prisma.purchasePlan.create({ data: { name: QUICK_LIST_NAME, status: "DRAFT", createdById: user.id } });
    }
    const planId = plan.id;

    const recs = await prisma.reorderRecommendation.findMany({
      where: { productId: { in: productIds }, isLatest: true },
    });
    const existing = await prisma.purchasePlanItem.findMany({
      where: { planId, productId: { in: productIds } },
      select: { productId: true },
    });
    const alreadyOn = new Set(existing.map((e) => e.productId));

    let added = 0;
    let skipped = 0;
    for (const rec of recs) {
      if (alreadyOn.has(rec.productId)) continue;
      if (rec.recommendedQty30 <= 0) {
        skipped++;
        continue;
      }
      const expectedTotalCost =
        rec.bestSupplierPrice != null ? Number(rec.bestSupplierPrice) * rec.recommendedQty30 : null;
      await prisma.purchasePlanItem.create({
        data: {
          planId,
          productId: rec.productId,
          supplierId: rec.bestSupplierId ?? undefined,
          systemRecommendedQty: rec.recommendedQty30,
          supplierPrice: rec.bestSupplierPrice ?? undefined,
          expectedTotalCost: expectedTotalCost ?? undefined,
          status: "SUGGESTED",
        },
      });
      added++;
    }
    const alreadyOnList = productIds.length - added - skipped;

    await recordAudit({
      userId: user.id,
      action: "BULK_ADD_TO_REORDER",
      entityType: "PurchasePlan",
      entityId: planId,
      newValue: { productIds, added, skipped, alreadyOnList },
      source: "ui",
    });

    revalidatePath("/purchase-plans");
    revalidatePath("/reorder-center");

    return { added, alreadyOnList, skipped };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
