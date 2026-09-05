import { titleCase } from "../lib/format";

export type BadgeVariant = "red" | "orange" | "yellow" | "green" | "blue" | "gray";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  red: "bg-red-100 text-red-800 ring-red-600/20",
  orange: "bg-orange-100 text-orange-800 ring-orange-600/20",
  yellow: "bg-yellow-100 text-yellow-800 ring-yellow-600/20",
  green: "bg-green-100 text-green-800 ring-green-600/20",
  blue: "bg-blue-100 text-blue-800 ring-blue-600/20",
  gray: "bg-slate-100 text-slate-700 ring-slate-500/20",
};

/**
 * Color meanings are fixed across the whole app (spec section 38):
 * red = loss/urgent/OOS, orange = critical, yellow = warning/near-OOS,
 * green = healthy/profitable. Every status enum in the system maps into
 * this same palette so the dashboard reads consistently at a glance.
 */
const STATUS_VARIANT_MAP: Record<string, BadgeVariant> = {
  // profit status
  HIGH_PROFIT: "green",
  PROFITABLE: "green",
  LOW_PROFIT: "yellow",
  BREAK_EVEN: "gray",
  LOSS: "red",
  UNKNOWN: "gray",
  // stock status
  OOS: "red",
  CRITICAL: "orange",
  NEAR_OOS: "yellow",
  LOW_STOCK: "yellow",
  HEALTHY: "green",
  // reorder status
  NO_REORDER: "gray",
  MONITOR: "gray",
  REORDER_REQUIRED: "yellow",
  HIGH_PRIORITY_REORDER: "red",
  SUPPLIER_AVAILABLE: "blue",
  SUPPLIER_NOT_FOUND: "orange",
  NOT_PROFITABLE_TO_REORDER: "gray",
  // priority
  NONE: "gray",
  LOW: "gray",
  MEDIUM: "yellow",
  HIGH: "orange",
  // listing status
  BUYBOX_WIN: "green",
  BUYBOX_WIN_LOW_PROFIT: "yellow",
  SELLING_AT_LOSS: "red",
  NO_BUYBOX: "gray",
  INBOUND: "blue",
  RESERVED: "blue",
  UNFULFILLABLE: "orange",
  // invoice line status
  PRICE_OK: "green",
  PRICE_DECREASED: "green",
  PRICE_INCREASED: "yellow",
  LARGE_PRICE_INCREASE: "red",
  BETTER_SUPPLIER_AVAILABLE: "blue",
  QTY_DIFFERENCE: "yellow",
  UNKNOWN_PRODUCT: "gray",
  BARCODE_NOT_MATCHED: "gray",
  REVIEW_REQUIRED: "yellow",
  // purchase order status
  DRAFT: "gray",
  ORDERED: "blue",
  PARTIALLY_RECEIVED: "yellow",
  RECEIVED: "green",
  CANCELLED: "red",
  // invoice status
  UPLOADED: "gray",
  MATCHING: "blue",
  REVIEWED: "yellow",
  APPROVED: "green",
  REJECTED: "red",
  // sheet connection / import job / tab mapping status
  NOT_CONFIGURED: "gray",
  CONNECTION_REQUIRED: "orange",
  CONNECTED: "green",
  ERROR: "red",
  OK: "green",
  SOURCE_MAPPING_ISSUE: "red",
  SUCCEEDED: "green",
  FAILED: "red",
  PARTIAL: "yellow",
  RUNNING: "blue",
  PENDING: "gray",
  CONFIRMED: "green",
  // alert severity
  INFO: "blue",
  WARNING: "yellow",
  OPEN: "orange",
  ACKNOWLEDGED: "yellow",
  RESOLVED: "green",
  // supplier match outcomes
  MATCHED_ALREADY_SELLING: "green",
  URGENT_REORDER_OPPORTUNITY: "red",
  REORDER_OPPORTUNITY: "yellow",
  AVAILABLE_BUT_NOT_PROFITABLE: "gray",
  UNMATCHED: "gray",
};

export function statusVariant(status: string | null | undefined): BadgeVariant {
  if (!status) return "gray";
  return STATUS_VARIANT_MAP[status] ?? "gray";
}

export function StatusBadge({ status, label }: { status: string | null | undefined; label?: string }) {
  if (!status) return <span className="text-slate-400 text-xs">—</span>;
  const variant = statusVariant(status);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap ${VARIANT_CLASSES[variant]}`}
    >
      {label ?? titleCase(status)}
    </span>
  );
}
