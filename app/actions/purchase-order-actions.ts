"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "../../lib/prisma";
import { requireUser, requirePermission, getCurrentUser } from "../../lib/auth/current-user";
import { can } from "../../lib/auth/permissions";
import { recordAudit } from "../../lib/audit";
import { recomputeProduct } from "../../lib/engine/recompute";

export interface PoActionState {
  success?: boolean;
  error?: string;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && v !== null && "toNumber" in (v as never)) return (v as { toNumber: () => number }).toNumber();
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Marks a DRAFT purchase order as sent to the supplier ("ORDERED"). */
export async function markOrderedAction(_prev: PoActionState, formData: FormData): Promise<PoActionState> {
  try {
    const user = await requirePermission("create_purchase_orders");
    const poId = String(formData.get("poId"));
    const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poId } });
    if (po.status !== "DRAFT") return { error: `Cannot mark as ordered — PO is already ${po.status}.` };

    await prisma.purchaseOrder.update({ where: { id: poId }, data: { status: "ORDERED" } });
    await recordAudit({
      userId: user.id,
      action: "MARK_PO_ORDERED",
      entityType: "PurchaseOrder",
      entityId: poId,
      oldValue: { status: po.status },
      newValue: { status: "ORDERED" },
      source: "ui",
    });

    revalidatePath(`/purchase-orders/${poId}`);
    revalidatePath("/purchase-orders");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Cancels a PO — only allowed before anything has been received. */
export async function cancelPurchaseOrderAction(_prev: PoActionState, formData: FormData): Promise<PoActionState> {
  try {
    const user = await requirePermission("create_purchase_orders");
    const poId = String(formData.get("poId"));
    const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poId }, include: { items: true } });
    if (po.status === "CANCELLED" || po.status === "RECEIVED") return { error: `PO is already ${po.status}.` };
    if (po.items.some((i) => i.receivedQty > 0)) return { error: "Cannot cancel — some items have already been received." };

    await prisma.purchaseOrder.update({ where: { id: poId }, data: { status: "CANCELLED" } });
    // Free the originating plan items back up so they can be re-planned.
    await prisma.purchasePlanItem.updateMany({
      where: { id: { in: (await prisma.purchaseOrderItem.findMany({ where: { poId } })).map((i) => i.planItemId).filter((x): x is string => !!x) } },
      data: { status: "REVIEWING" },
    });

    await recordAudit({
      userId: user.id,
      action: "CANCEL_PURCHASE_ORDER",
      entityType: "PurchaseOrder",
      entityId: poId,
      oldValue: { status: po.status },
      newValue: { status: "CANCELLED" },
      source: "ui",
    });

    revalidatePath(`/purchase-orders/${poId}`);
    revalidatePath("/purchase-orders");
    revalidatePath("/purchase-plans");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export interface ReceiveItemsState extends PoActionState {
  receivedTotal?: number;
}

/**
 * Records goods physically received against a PO. Each line's "receive now"
 * quantity is an INCREMENTAL delta (not a new absolute total), mirroring how
 * Stock_IN rows work: it creates a real InventoryTransaction (PO_RECEIPT),
 * a PurchaseHistory row, and bumps the product's Rover warehouse balance —
 * this is real stock arriving, not just a status label. The PO's own status
 * then derives from how much of each line has been received in total.
 */
export async function receiveItemsAction(_prev: ReceiveItemsState, formData: FormData): Promise<ReceiveItemsState> {
  try {
    const user = await requireUser();
    if (!can(user.role, "manage_stock_movements") && !can(user.role, "create_purchase_orders")) {
      throw new Error(`Forbidden: your role (${user.role}) cannot receive purchase order stock.`);
    }

    const poId = String(formData.get("poId"));
    const po = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: poId },
      include: { items: true },
    });
    if (po.status === "CANCELLED") return { error: "Cannot receive against a cancelled PO." };
    if (po.status === "DRAFT") return { error: "Mark the PO as Ordered before recording receipts." };

    const roverLocation = await prisma.inventoryLocation.upsert({
      where: { code: "ROVER" },
      create: { code: "ROVER", name: "Rover Warehouse" },
      update: {},
    });

    const now = new Date();
    let anyReceived = false;
    const affectedProductIds = new Set<string>();

    for (const item of po.items) {
      const raw = formData.get(`receiveQty_${item.id}`);
      const delta = raw != null && raw !== "" ? Math.round(Number(raw)) : 0;
      if (!delta || delta <= 0) continue;
      const remaining = item.qtyOrdered - item.receivedQty;
      if (delta > remaining) {
        return { error: `Cannot receive ${delta} for a line with only ${remaining} remaining.` };
      }

      const unitCost = num(item.unitCost) ?? 0;

      await prisma.$transaction(async (tx) => {
        await tx.inventoryTransaction.create({
          data: {
            productId: item.productId,
            locationId: roverLocation.id,
            direction: "IN",
            sourceType: "PO_RECEIPT",
            qty: delta,
            transactionDate: now,
            invoiceId: po.invoiceReference ?? undefined,
            newCostPrice: unitCost,
            remarks: `Received against ${po.poNumber}`,
            fingerprint: randomUUID(),
            supplierId: po.supplierId,
          },
        });

        const product = await tx.product.findUniqueOrThrow({ where: { id: item.productId } });

        await tx.purchaseHistory.create({
          data: {
            productId: item.productId,
            transactionId: randomUUID(),
            date: now,
            invoiceId: po.invoiceReference ?? undefined,
            supplierId: po.supplierId,
            qty: delta,
            newCost: unitCost || product.currentCost || 0,
            previousCost: product.currentCost ?? undefined,
            priceDiff: product.currentCost != null ? unitCost - Number(product.currentCost) : undefined,
            source: "po_receipt",
          },
        });

        const bal = await tx.inventoryBalance.upsert({
          where: { productId_locationId: { productId: item.productId, locationId: roverLocation.id } },
          create: { productId: item.productId, locationId: roverLocation.id, qty: delta },
          update: { qty: { increment: delta } },
        });

        const priorQty = product.lifetimePurchasedQty;
        const priorAvg = product.weightedAvgCost != null ? Number(product.weightedAvgCost) : unitCost;
        const newWeightedAvg = unitCost ? (priorAvg * priorQty + unitCost * delta) / (priorQty + delta || 1) : priorAvg;
        const newLowest = product.lowestHistoricalCost == null || unitCost < Number(product.lowestHistoricalCost) ? unitCost : Number(product.lowestHistoricalCost);
        const newHighest = product.highestHistoricalCost == null || unitCost > Number(product.highestHistoricalCost) ? unitCost : Number(product.highestHistoricalCost);

        await tx.product.update({
          where: { id: item.productId },
          data: {
            roverQty: bal.qty,
            currentCost: unitCost || product.currentCost,
            lastPurchaseCost: unitCost || product.lastPurchaseCost,
            lastPurchaseDate: now,
            firstPurchaseDate: product.firstPurchaseDate ?? now,
            weightedAvgCost: newWeightedAvg,
            lowestHistoricalCost: newLowest,
            highestHistoricalCost: newHighest,
            purchaseCount: { increment: 1 },
            lifetimePurchasedQty: { increment: delta },
          },
        });

        await tx.purchaseOrderItem.update({ where: { id: item.id }, data: { receivedQty: { increment: delta } } });
      });

      affectedProductIds.add(item.productId);
      anyReceived = true;
    }

    if (!anyReceived) return { error: "Enter a receive quantity for at least one line." };

    for (const productId of affectedProductIds) await recomputeProduct(productId);

    const refreshedItems = await prisma.purchaseOrderItem.findMany({ where: { poId } });
    const allDone = refreshedItems.every((i) => i.receivedQty >= i.qtyOrdered);
    const anyDone = refreshedItems.some((i) => i.receivedQty > 0);
    const newStatus = allDone ? "RECEIVED" : anyDone ? "PARTIALLY_RECEIVED" : po.status;
    if (newStatus !== po.status) {
      await prisma.purchaseOrder.update({ where: { id: poId }, data: { status: newStatus } });
    }

    await recordAudit({
      userId: user.id,
      action: "RECEIVE_PURCHASE_ORDER_ITEMS",
      entityType: "PurchaseOrder",
      entityId: poId,
      newValue: { newStatus },
      source: "ui",
    });

    revalidatePath(`/purchase-orders/${poId}`);
    revalidatePath("/purchase-orders");
    revalidatePath("/stock-movements");
    revalidatePath("/purchase-history");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function canReceivePurchaseOrders(): Promise<boolean> {
  const user = await getCurrentUser();
  return !!user && (can(user.role, "manage_stock_movements") || can(user.role, "create_purchase_orders"));
}

export async function canManagePurchaseOrders(): Promise<boolean> {
  const user = await getCurrentUser();
  return !!user && can(user.role, "create_purchase_orders");
}
