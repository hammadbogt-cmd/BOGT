"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../lib/prisma";
import { requirePermission, getCurrentUser } from "../../lib/auth/current-user";
import { can } from "../../lib/auth/permissions";
import { recordAudit } from "../../lib/audit";
import { getSettings } from "../../lib/settings-store";
import { calculateProfit } from "../../lib/calc/profitability";

export interface PlanItemFormState {
  success?: boolean;
  error?: string;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && v !== null && "toNumber" in (v as never)) return (v as { toNumber: () => number }).toNumber();
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Edits a Purchase Plan line: user-final quantity, chosen supplier, notes.
 * `systemRecommendedQty` is never touched here — the spec is explicit that
 * the original system recommendation must stay visible/untouched alongside
 * whatever a human decides to actually order (spec section 21).
 */
export async function updatePlanItemAction(_prev: PlanItemFormState, formData: FormData): Promise<PlanItemFormState> {
  try {
    const user = await requirePermission("create_purchase_plans");
    const itemId = String(formData.get("itemId"));
    const userFinalQtyRaw = formData.get("userFinalQty");
    const supplierId = formData.get("supplierId") ? String(formData.get("supplierId")) : null;
    const notes = formData.get("notes") ? String(formData.get("notes")) : null;

    const item = await prisma.purchasePlanItem.findUniqueOrThrow({ where: { id: itemId }, include: { product: true } });
    const userFinalQty = userFinalQtyRaw != null && userFinalQtyRaw !== "" ? Math.max(0, Math.round(Number(userFinalQtyRaw))) : null;
    const qty = userFinalQty ?? item.systemRecommendedQty;

    let supplierPrice: number | null = num(item.supplierPrice);
    let supplierStockQty: number | null = item.supplierStockQty;

    if (supplierId && supplierId !== item.supplierId) {
      const sp = await prisma.supplierProduct.findUnique({ where: { supplierId_productId: { supplierId, productId: item.productId } } });
      supplierPrice = sp ? num(sp.price) : null;
      supplierStockQty = sp?.stockQty ?? null;
    }

    const settings = await getSettings();
    const sellingPrice = num(item.product.ourPrice) ?? num(item.product.buyBoxPrice);
    let expectedProfit: number | null = null;
    let roiPct: number | null = null;
    if (sellingPrice != null && supplierPrice != null) {
      const p = calculateProfit({ sellingPrice, purchaseCost: supplierPrice, fbaFee: num(item.product.fbaFee) }, settings);
      expectedProfit = p.profit * qty;
      roiPct = p.roiPct;
    }
    const expectedTotalCost = supplierPrice != null ? supplierPrice * qty : null;

    await prisma.purchasePlanItem.update({
      where: { id: itemId },
      data: {
        userFinalQty: userFinalQty ?? undefined,
        supplierId: supplierId ?? undefined,
        supplierPrice: supplierPrice ?? undefined,
        supplierStockQty: supplierStockQty ?? undefined,
        expectedTotalCost: expectedTotalCost ?? undefined,
        expectedProfit: expectedProfit ?? undefined,
        roiPct: roiPct ?? undefined,
        notes: notes ?? undefined,
      },
    });

    await recordAudit({
      userId: user.id,
      action: "UPDATE_PURCHASE_PLAN_ITEM",
      entityType: "PurchasePlanItem",
      entityId: itemId,
      newValue: { userFinalQty, supplierId, notes },
      source: "ui",
    });

    revalidatePath(`/purchase-plans/${item.planId}`);
    revalidatePath("/purchase-plans");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Approve / cancel / reset-to-reviewing a line item. Approval is a distinct, gated permission from just editing. */
export async function setPlanItemStatusAction(_prev: PlanItemFormState, formData: FormData): Promise<PlanItemFormState> {
  try {
    const status = String(formData.get("status"));
    const permission = status === "APPROVED" ? "approve_purchase_plans" : "create_purchase_plans";
    const user = await requirePermission(permission);
    const itemId = String(formData.get("itemId"));

    const item = await prisma.purchasePlanItem.findUniqueOrThrow({ where: { id: itemId } });
    if (!["SUGGESTED", "REVIEWING", "APPROVED", "CANCELLED"].includes(status)) {
      return { error: `Unsupported status "${status}".` };
    }

    await prisma.purchasePlanItem.update({ where: { id: itemId }, data: { status: status as never } });

    await recordAudit({
      userId: user.id,
      action: "SET_PURCHASE_PLAN_ITEM_STATUS",
      entityType: "PurchasePlanItem",
      entityId: itemId,
      oldValue: { status: item.status },
      newValue: { status },
      source: "ui",
    });

    revalidatePath(`/purchase-plans/${item.planId}`);
    revalidatePath("/purchase-plans");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export interface ConvertToPoState {
  success?: boolean;
  error?: string;
  createdPoNumbers?: string[];
  skipped?: number;
}

/**
 * Converts selected, supplier-assigned plan items into Purchase Orders — one
 * PO per supplier, since a single PO can't span suppliers. Items missing a
 * supplier/price, already ordered, or cancelled are skipped rather than
 * silently included.
 */
export async function convertToPurchaseOrderAction(_prev: ConvertToPoState, formData: FormData): Promise<ConvertToPoState> {
  try {
    const user = await requirePermission("create_purchase_orders");
    const itemIds = formData.getAll("itemIds").map(String).filter(Boolean);
    if (itemIds.length === 0) return { error: "Select at least one item first." };

    const items = await prisma.purchasePlanItem.findMany({ where: { id: { in: itemIds } } });

    const eligible = items.filter(
      (i) => i.supplierId && num(i.supplierPrice) != null && !["ORDERED", "PARTIALLY_ORDERED", "INVOICED", "RECEIVED", "CANCELLED"].includes(i.status)
    );
    const skipped = items.length - eligible.length;
    if (eligible.length === 0) {
      return { error: "None of the selected items have a supplier + price assigned, or they're already ordered/cancelled.", skipped };
    }

    const bySupplier = new Map<string, typeof eligible>();
    for (const item of eligible) {
      const list = bySupplier.get(item.supplierId!) ?? [];
      list.push(item);
      bySupplier.set(item.supplierId!, list);
    }

    const createdPoNumbers: string[] = [];
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    for (const [supplierId, supplierItems] of bySupplier) {
      const countToday = await prisma.purchaseOrder.count({ where: { poNumber: { startsWith: `PO-${datePart}` } } });
      const poNumber = `PO-${datePart}-${String(countToday + 1).padStart(3, "0")}`;

      const po = await prisma.purchaseOrder.create({
        data: { poNumber, supplierId, status: "DRAFT", createdById: user.id },
      });

      for (const item of supplierItems) {
        const qty = item.userFinalQty ?? item.systemRecommendedQty;
        const unitCost = num(item.supplierPrice) ?? 0;
        await prisma.purchaseOrderItem.create({
          data: {
            poId: po.id,
            productId: item.productId,
            planItemId: item.id,
            qtyOrdered: qty,
            unitCost,
            expectedTotal: unitCost * qty,
          },
        });
        await prisma.purchasePlanItem.update({ where: { id: item.id }, data: { status: "ORDERED" } });
      }

      await recordAudit({
        userId: user.id,
        action: "CREATE_PURCHASE_ORDER",
        entityType: "PurchaseOrder",
        entityId: po.id,
        newValue: { poNumber, supplierId, itemCount: supplierItems.length },
        source: "ui",
      });

      createdPoNumbers.push(poNumber);
    }

    revalidatePath("/purchase-orders");
    revalidatePath("/purchase-plans");
    for (const item of eligible) revalidatePath(`/purchase-plans/${item.planId}`);

    return { success: true, createdPoNumbers, skipped };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function canApprovePurchasePlans(): Promise<boolean> {
  const user = await getCurrentUser();
  return !!user && can(user.role, "approve_purchase_plans");
}
