import { BusinessSettings } from "./settings";

export type StockStatus = "OOS" | "CRITICAL" | "NEAR_OOS" | "LOW_STOCK" | "HEALTHY";

export interface NetAvailabilityInput {
  amazonQty: number;
  roverQty: number;
  officeQty: number;
  incomingQty: number;
}

/**
 * Physical Warehouse Available = Rover + Office
 * Total Business Available     = Amazon + Rover + Office + Incoming
 * (spec section 5). Office inclusion is settings-gated (section 5 Admin toggle).
 */
export function physicalWarehouseAvailable(input: NetAvailabilityInput): number {
  return input.roverQty + input.officeQty;
}

export function netAvailable(input: NetAvailabilityInput, settings: BusinessSettings): number {
  const office = settings.includeOfficeStockInAvailability ? input.officeQty : 0;
  return input.amazonQty + input.roverQty + office + input.incomingQty;
}

/**
 * BSR-tiered target demand (spec section 7).
 *
 * Priority tier (BSR <= priorityBsrThreshold):
 *   target = max(sales * priorityDemandMultiplier, floor)
 *   where floor scales with the coverage window (50 for 30 days, 100 for 60, etc).
 *   This reproduces the worked examples exactly: sales of 40/45/50 -> 50 (the
 *   floor wins), sales of 70 -> 70 (actual demand wins, never capped).
 *
 * Standard tier (BSR > priorityBsrThreshold):
 *   target = roundUp(sales * standardDemandMultiplier, roundingIncrement)
 *   e.g. sales=35 -> roundUp(35, 10) = 40, matching the worked example.
 *
 * `periodDays` lets the same function serve both the 30-day and 60-day
 * windows: the floor and rounding increment scale proportionally with the
 * window length relative to 30 days.
 */
export function targetDemand(
  salesForPeriod: number,
  bsr: number | null | undefined,
  periodDays: number,
  settings: BusinessSettings
): number {
  const scale = periodDays / 30;
  const isPriority = bsr != null && bsr > 0 && bsr <= settings.priorityBsrThreshold;

  if (isPriority) {
    const floor = settings.priorityMinTargetQty * scale;
    const raw = salesForPeriod * settings.priorityDemandMultiplier;
    return Math.round(Math.max(raw, floor));
  }

  const increment = Math.max(1, Math.round(settings.standardRoundingIncrement * scale));
  const raw = salesForPeriod * settings.standardDemandMultiplier;
  return roundUpToNearest(raw, increment);
}

export function roundUpToNearest(value: number, increment: number): number {
  if (increment <= 0) return Math.round(value);
  return Math.ceil(value / increment) * increment;
}

export interface RecommendedQtyBreakdown {
  targetDemand: number;
  safetyStock: number;
  amazonQty: number;
  roverQty: number;
  officeQty: number;
  officeIncluded: boolean;
  incomingQty: number;
  netAvailable: number;
  recommendedQty: number;
  formula: string;
}

/**
 * Core net-purchase-requirement formula (spec section 8):
 *   Net Available     = Amazon + Rover + (Office if enabled) + Incoming PO
 *   Recommended Order = TargetDemand + SafetyStock - NetAvailable, floored at 0
 *
 * Returns a full transparency breakdown (spec section 43) so the UI can
 * always show "why" a number was recommended, never an unexplained figure.
 */
export function calculateRecommendedQty(
  target: number,
  safetyStock: number,
  availability: NetAvailabilityInput,
  settings: BusinessSettings
): RecommendedQtyBreakdown {
  const office = settings.includeOfficeStockInAvailability ? availability.officeQty : 0;
  const net = availability.amazonQty + availability.roverQty + office + availability.incomingQty;
  const raw = target + safetyStock - net;
  const recommended = roundUpToNearest(Math.max(raw, 0), settings.reorderRounding);

  const officeTerm = settings.includeOfficeStockInAvailability
    ? ` + Office(${availability.officeQty})`
    : ` + Office(excluded)`;

  return {
    targetDemand: target,
    safetyStock,
    amazonQty: availability.amazonQty,
    roverQty: availability.roverQty,
    officeQty: availability.officeQty,
    officeIncluded: settings.includeOfficeStockInAvailability,
    incomingQty: availability.incomingQty,
    netAvailable: net,
    recommendedQty: recommended,
    formula: `Target(${target}) + Safety(${safetyStock}) - [Amazon(${availability.amazonQty}) + Rover(${availability.roverQty})${officeTerm} + Incoming(${availability.incomingQty}) = ${net}] = ${Math.max(raw, 0)}`,
  };
}

export function averageDailySales(unitsShippedT30: number): number {
  return unitsShippedT30 / 30;
}

/**
 * Days of Stock = Net Available Stock / Average Daily Sales (spec section 10).
 * Returns null when there is no sales velocity to divide by (treated as
 * "no sales" rather than infinite days by the caller).
 */
export function daysOfStock(netAvailableQty: number, avgDailySales: number): number | null {
  if (avgDailySales <= 0) return null;
  return netAvailableQty / avgDailySales;
}

/** Editable day-based stock-status thresholds (spec section 10). */
export function classifyStockStatus(
  days: number | null,
  netAvailableQty: number,
  settings: BusinessSettings
): StockStatus {
  if (netAvailableQty <= 0) return "OOS";
  if (days === null) return "HEALTHY"; // in stock, but no recent sales velocity to judge against
  if (days <= settings.criticalStockDaysMax) return "CRITICAL";
  if (days <= settings.nearOosDaysMax) return "NEAR_OOS";
  if (days <= settings.lowStockDaysMax) return "LOW_STOCK";
  return "HEALTHY";
}

export type ReorderPriority = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface PriorityInput {
  bsr: number | null | undefined;
  stockStatus: StockStatus;
  recommendedQty: number;
  hasSupplier: boolean;
  isProfitable: boolean;
}

/**
 * Reorder priority combines urgency (stock status) with commercial viability.
 * A product that isn't profitable to reorder is never HIGH/CRITICAL even if
 * it's OOS — see "Not Profitable to Reorder" reorder status (section 35).
 */
export function calculatePriority(input: PriorityInput, settings: BusinessSettings): ReorderPriority {
  if (input.recommendedQty <= 0) return "NONE";
  if (!input.isProfitable) return "LOW";

  const isPriorityBsr = input.bsr != null && input.bsr > 0 && input.bsr <= settings.priorityBsrThreshold;

  if (input.stockStatus === "OOS") return isPriorityBsr ? "CRITICAL" : "HIGH";
  if (input.stockStatus === "CRITICAL") return isPriorityBsr ? "HIGH" : "MEDIUM";
  if (input.stockStatus === "NEAR_OOS") return isPriorityBsr ? "MEDIUM" : "LOW";
  return "LOW";
}
