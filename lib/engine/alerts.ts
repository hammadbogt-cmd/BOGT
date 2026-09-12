import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../prisma";
import type { BusinessSettings } from "../calc/settings";
import type { StockStatus } from "../calc/reorder";
import { bulkUpdateById } from "../import/bulk";

export type AlertSeverityInput = "INFO" | "WARNING" | "CRITICAL";

interface AlertCondition {
  type: string;
  active: boolean;
  severity: AlertSeverityInput;
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * Alert-generation engine (spec section 44: "the system should surface
 * problems proactively rather than waiting for someone to notice"). This is
 * the STATE-based half of the alert catalog — conditions derived from a
 * product's current computed snapshot, re-evaluated every time
 * `recomputeProduct` runs so an alert opens the moment a condition becomes
 * true and auto-resolves the moment it stops being true.
 *
 * EVENT-based alerts (a price changed just now, a duplicate barcode was just
 * rejected, an invoice line just came in high) are created at the point the
 * event happens instead — see supplier-price-list-importer.ts,
 * match-product.ts callers, and invoice-importer.ts.
 *
 * Idempotent by design, and batched for performance: with hundreds of
 * products recomputed in one pass (recomputeAllProducts), evaluating each of
 * the ~14 conditions with its own findFirst query would mean thousands of
 * sequential round trips. Instead this reads every still-open (OPEN or
 * ACKNOWLEDGED) alert for the product's state-based types in ONE query, diffs
 * it against the freshly-computed conditions in memory, and only issues
 * writes for what actually changed (usually none, once alerts have settled) —
 * so a stable product costs exactly one query. A manually RESOLVED alert is
 * never reopened by this pass.
 */
const STATE_ALERT_TYPES = [
  "AMAZON_OOS",
  "NEAR_OOS",
  "LOW_DAYS_STOCK",
  "HIGH_SALES_LOW_STOCK",
  "BSR_REORDER_NEEDED",
  "SUPPLIER_STOCK_FOR_OOS",
  "SELLING_AT_LOSS",
  "ROI_BELOW_THRESHOLD",
  "BETTER_SUPPLIER_AVAILABLE",
  "MISSING_ASIN",
  "UNKNOWN_BARCODE",
  "NEGATIVE_WAREHOUSE_STOCK",
  "HIGH_INVENTORY_NO_SALES",
  "OVERSTOCK",
] as const;

/**
 * Diffs freshly-computed conditions against what's already open, for MANY
 * products at once: one read for the whole batch, then one batched write per
 * kind of change. Recomputing thousands of products otherwise means
 * thousands of sequential round trips, which is what makes a full sync
 * outlive its request budget.
 */
async function syncAlertsBulk(client: PrismaClient, entries: { productId: string; conditions: AlertCondition[] }[]) {
  if (entries.length === 0) return;
  const productIds = entries.map((e) => e.productId);

  const existingAlerts = await client.alert.findMany({
    where: {
      productId: { in: productIds },
      type: { in: STATE_ALERT_TYPES as unknown as never[] },
      status: { in: ["OPEN", "ACKNOWLEDGED"] },
    },
    select: { id: true, productId: true, type: true, severity: true, message: true },
  });
  const existingByKey = new Map(existingAlerts.map((a) => [`${a.productId} ${a.type as string}`, a]));

  const creates: { productId: string; condition: AlertCondition }[] = [];
  const updates: { id: string; severity: AlertSeverityInput; message: string; metadata?: Record<string, unknown> }[] = [];
  const resolves: string[] = [];

  for (const entry of entries) {
    for (const condition of entry.conditions) {
      const existing = existingByKey.get(`${entry.productId} ${condition.type}`);
      if (condition.active) {
        if (!existing) {
          creates.push({ productId: entry.productId, condition });
        } else if (existing.severity !== condition.severity || existing.message !== condition.message) {
          updates.push({ id: existing.id, severity: condition.severity, message: condition.message, metadata: condition.metadata });
        }
      } else if (existing) {
        resolves.push(existing.id);
      }
    }
  }

  if (creates.length > 0) {
    for (let i = 0; i < creates.length; i += 500) {
      await client.alert.createMany({
        data: creates.slice(i, i + 500).map(({ productId, condition }) => ({
          productId,
          type: condition.type as never,
          severity: condition.severity as never,
          status: "OPEN" as never,
          message: condition.message,
          metadata: condition.metadata ? JSON.parse(JSON.stringify(condition.metadata)) : undefined,
        })),
      });
    }
  }

  // Wording/severity changes are common after a stock or price move, so
  // these are written as one statement per batch rather than one per alert.
  await bulkUpdateById(
    client,
    "alerts",
    [
      { name: "severity", type: "text", cast: '"AlertSeverity"' },
      { name: "message", type: "text" },
      { name: "metadata", type: "text", cast: "jsonb" },
    ],
    updates.map((u) => ({
      id: u.id,
      severity: u.severity,
      message: u.message,
      metadata: u.metadata ? JSON.stringify(u.metadata) : null,
    }))
  );

  for (let i = 0; i < resolves.length; i += 1000) {
    await client.alert.updateMany({ where: { id: { in: resolves.slice(i, i + 1000) } }, data: { status: "RESOLVED" } });
  }
}

export interface ProductAlertSnapshot {
  productId: string;
  title: string;
  asin: string | null;
  primaryBarcode: string | null;
  isActive: boolean;
  amazonAvailableQty: number;
  roverQty: number;
  officeQty: number;
  t30Sales: number;
  bsr: number | null;
  stockStatus: StockStatus;
  daysOfStock: number | null;
  reorderStatus: string;
  profitStatus: string;
  roiPct: number | null;
  currentCost: number | null;
  target30: number;
  bestSupplierId: string | null;
  bestSupplierPrice: number | null;
  offers: { supplierId: string; supplierName: string; price: number; stockQty: number | null; disqualified: boolean }[];
}

/** Re-evaluates every STATE-based alert type for one product's current snapshot. */
export async function evaluateProductAlerts(snapshot: ProductAlertSnapshot, settings: BusinessSettings, client: PrismaClient = defaultPrisma) {
  await evaluateProductAlertsBulk([snapshot], settings, client);
}

/** The same evaluation for a whole batch of products, with batched reads and writes. */
export async function evaluateProductAlertsBulk(
  snapshots: ProductAlertSnapshot[],
  settings: BusinessSettings,
  client: PrismaClient = defaultPrisma
) {
  const entries = snapshots
    .filter((s) => s.isActive) // don't alert on delisted/inactive products
    .map((s) => ({ productId: s.productId, conditions: buildAlertConditions(s, settings) }));
  await syncAlertsBulk(client, entries);
}

function buildAlertConditions(snapshot: ProductAlertSnapshot, settings: BusinessSettings): AlertCondition[] {
  const netAvailable = snapshot.amazonAvailableQty + snapshot.roverQty + snapshot.officeQty;
  const cheapestQualifyingOffer = snapshot.offers
    .filter((o) => !o.disqualified)
    .sort((a, b) => a.price - b.price)[0];
  const supplierWithStock = snapshot.offers.find((o) => (o.stockQty ?? 0) > 0);

  const conditions: AlertCondition[] = [
    {
      type: "AMAZON_OOS",
      active: snapshot.amazonAvailableQty <= 0,
      severity: "CRITICAL",
      message: `${snapshot.title} is out of stock on Amazon (0 available).`,
    },
    {
      type: "NEAR_OOS",
      active: snapshot.stockStatus === "NEAR_OOS",
      severity: "WARNING",
      message: `${snapshot.title} is near out-of-stock (${snapshot.daysOfStock?.toFixed(1) ?? "?"} days of stock left).`,
      metadata: { daysOfStock: snapshot.daysOfStock },
    },
    {
      type: "LOW_DAYS_STOCK",
      active: snapshot.stockStatus === "LOW_STOCK",
      severity: "WARNING",
      message: `${snapshot.title} has only ${snapshot.daysOfStock?.toFixed(1) ?? "?"} days of stock remaining.`,
      metadata: { daysOfStock: snapshot.daysOfStock },
    },
    {
      type: "HIGH_SALES_LOW_STOCK",
      active: snapshot.t30Sales >= settings.highSalesThreshold && ["OOS", "CRITICAL", "NEAR_OOS", "LOW_STOCK"].includes(snapshot.stockStatus),
      severity: "WARNING",
      message: `${snapshot.title} is selling fast (${snapshot.t30Sales} units/30d) but stock is ${snapshot.stockStatus.toLowerCase().replace("_", " ")}.`,
    },
    {
      type: "BSR_REORDER_NEEDED",
      active: snapshot.bsr != null && snapshot.bsr <= settings.priorityBsrThreshold && snapshot.reorderStatus === "HIGH_PRIORITY_REORDER",
      severity: "CRITICAL",
      message: `${snapshot.title} has a strong BSR (${snapshot.bsr}) and needs an urgent reorder.`,
    },
    {
      type: "SUPPLIER_STOCK_FOR_OOS",
      active: ["OOS", "CRITICAL"].includes(snapshot.stockStatus) && !!supplierWithStock,
      severity: "INFO",
      message: `${snapshot.title} is ${snapshot.stockStatus === "OOS" ? "out of stock" : "critically low"}, and ${supplierWithStock?.supplierName ?? "a supplier"} currently has stock available to reorder.`,
      metadata: { supplierId: supplierWithStock?.supplierId },
    },
    {
      type: "SELLING_AT_LOSS",
      active: snapshot.profitStatus === "LOSS",
      severity: "CRITICAL",
      message: `${snapshot.title} is currently selling at a loss.`,
    },
    {
      type: "ROI_BELOW_THRESHOLD",
      active: snapshot.profitStatus !== "LOSS" && snapshot.roiPct != null && snapshot.roiPct / 100 < settings.minRoiPct,
      severity: "WARNING",
      message: `${snapshot.title}'s ROI (${snapshot.roiPct?.toFixed(1)}%) is below the ${(settings.minRoiPct * 100).toFixed(0)}% minimum.`,
    },
    {
      type: "BETTER_SUPPLIER_AVAILABLE",
      active: !!cheapestQualifyingOffer && snapshot.currentCost != null && cheapestQualifyingOffer.price < snapshot.currentCost - 0.01 && cheapestQualifyingOffer.supplierId !== snapshot.bestSupplierId,
      severity: "INFO",
      message: `${snapshot.title}: ${cheapestQualifyingOffer?.supplierName ?? "a supplier"} now offers a lower qualifying price than the current cost basis.`,
      metadata: { supplierId: cheapestQualifyingOffer?.supplierId, price: cheapestQualifyingOffer?.price },
    },
    {
      type: "MISSING_ASIN",
      active: !snapshot.asin,
      severity: "WARNING",
      message: `${snapshot.title} has no ASIN on file.`,
    },
    {
      type: "UNKNOWN_BARCODE",
      active: !snapshot.primaryBarcode,
      severity: "WARNING",
      message: `${snapshot.title} has no barcode on file.`,
    },
    {
      type: "NEGATIVE_WAREHOUSE_STOCK",
      active: snapshot.roverQty < 0 || snapshot.officeQty < 0,
      severity: "CRITICAL",
      message: `${snapshot.title} has gone negative in warehouse stock (Rover ${snapshot.roverQty}, Office ${snapshot.officeQty}).`,
    },
    {
      type: "HIGH_INVENTORY_NO_SALES",
      active: netAvailable > 20 && snapshot.t30Sales === 0,
      severity: "WARNING",
      message: `${snapshot.title} has ${netAvailable} units on hand but zero sales in the last 30 days.`,
    },
    {
      type: "OVERSTOCK",
      active: snapshot.daysOfStock != null && snapshot.daysOfStock > settings.overstockDaysThreshold,
      severity: "INFO",
      message: `${snapshot.title} is overstocked at ${snapshot.daysOfStock?.toFixed(0)} days of stock (threshold ${settings.overstockDaysThreshold}).`,
    },
  ];

  return conditions;
}

export async function runFullAlertScan(client: PrismaClient = defaultPrisma) {
  const { recomputeAllProducts } = await import("./recompute");
  return recomputeAllProducts(client);
}
