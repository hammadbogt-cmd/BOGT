import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../prisma";

/**
 * Listing-status totals, calculated here rather than read from a sheet.
 *
 * The workbook used to carry a "Total Listng Status" tab holding these
 * figures. Syncing a tab of totals means importing someone else's
 * arithmetic and inheriting whatever state it was last saved in, so the
 * portal now derives the same numbers directly from the product rows it
 * already syncs — for ALL products and for the USA (OA) catalog separately,
 * exactly as the sheet presented them.
 *
 * Source of truth is the CURRENT Amazon stats snapshot per product per
 * catalog (AmazonStats.isCurrent), which is where each row's own "Listing
 * Status" text from the sheet is stored — so the buckets match the sheet's
 * own wording instead of a re-derived approximation.
 */

export const LISTING_STATUS_BUCKETS = [
  "Buybox Win",
  "Buybox Win Profit less then 10%",
  "BSR High Buybox WIN No Sale",
  "Buybox Not Win Our Price Is Low",
  "Price Update No Buybox",
  "Price Update Possible Till Breakeven",
  "No Buybox Our Price Is High",
  "Selling at Loss",
  "Out of Stock",
  "Inbound",
  "Reserved",
  "Unfulfillable",
] as const;

export type ListingStatusBucket = (typeof LISTING_STATUS_BUCKETS)[number] | "Other";

export interface StatusTotals {
  status: ListingStatusBucket;
  totalSku: number;
  totalSkuQty: number;
  totalValue: number;
  last30DaysUnitSales: number;
}

export interface CatalogSummary {
  label: string;
  totalSku: number;
  totalSkuQty: number;
  totalValue: number;
  last30DaysUnitSales: number;
  byStatus: StatusTotals[];
}

export interface ListingStatusSummary {
  /** "Total All Products Status" — the All PRODUCTS STATS catalog. */
  all: CatalogSummary;
  /** "Total USA Products Status" — the OA USA Products catalog. */
  usa: CatalogSummary;
  /** Both catalogs added together, for when the whole business is the question. */
  combined: CatalogSummary;
  /** Status labels found in the sheet that don't match a known bucket, so odd spellings are visible rather than silently dropped. */
  unrecognisedStatuses: string[];
  generatedAt: Date;
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim();
}

const BUCKET_BY_NORMALISED = new Map<string, ListingStatusBucket>(
  LISTING_STATUS_BUCKETS.map((b) => [normalise(b), b as ListingStatusBucket])
);

// Spelling variants seen in the workbooks, mapped onto the canonical bucket.
const ALIASES: Record<string, ListingStatusBucket> = {
  "buybox win profit less than 10%": "Buybox Win Profit less then 10%",
  "buybox win profit less then 10": "Buybox Win Profit less then 10%",
  "buybox win profit less than 10": "Buybox Win Profit less then 10%",
  "bsr high buybox win no sales": "BSR High Buybox WIN No Sale",
  "buybox not win our price is low": "Buybox Not Win Our Price Is Low",
  "no buybox our price is high": "No Buybox Our Price Is High",
  "price update possible till break even": "Price Update Possible Till Breakeven",
  "selling at a loss": "Selling at Loss",
  "out of stock": "Out of Stock",
  oos: "Out of Stock",
  unfulfilable: "Unfulfillable",
};

export function bucketForStatus(raw: string | null | undefined): { bucket: ListingStatusBucket; recognised: boolean } {
  if (!raw || raw.trim() === "") return { bucket: "Other", recognised: false };
  const key = normalise(raw);
  const direct = BUCKET_BY_NORMALISED.get(key);
  if (direct) return { bucket: direct, recognised: true };
  const alias = ALIASES[key];
  if (alias) return { bucket: alias, recognised: true };
  return { bucket: "Other", recognised: false };
}

interface StatsRow {
  source: string;
  listingStatus: string | null;
  availableQty: number | null;
  availableQtyValue: unknown;
  unitsShippedT30: number | null;
}

export async function getListingStatusSummary(client: PrismaClient = defaultPrisma): Promise<ListingStatusSummary> {
  const rows = await client.amazonStats.findMany({
    where: { isCurrent: true },
    select: { source: true, listingStatus: true, availableQty: true, availableQtyValue: true, unitsShippedT30: true },
  });

  const unrecognised = new Set<string>();
  const stats = rows as StatsRow[];

  // These mirror the sheet's own two blocks: "Total All Products Status"
  // counted the All PRODUCTS STATS tab, "Total USA Products Status" counted
  // the OA USA Products tab. Combined is offered as well, since the two
  // catalogs together are the whole business.
  const all = accumulate(
    stats.filter((r) => r.source !== "OA_USA"),
    "All Products",
    unrecognised
  );
  const usa = accumulate(
    stats.filter((r) => r.source === "OA_USA"),
    "USA Products",
    unrecognised
  );
  const combined = accumulate(stats, "All + USA Combined", unrecognised);

  return { all, usa, combined, unrecognisedStatuses: [...unrecognised].sort(), generatedAt: new Date() };
}

function accumulate(rows: StatsRow[], label: string, unrecognised: Set<string>): CatalogSummary {
  const buckets = new Map<ListingStatusBucket, StatusTotals>();
  const summary: CatalogSummary = { label, totalSku: 0, totalSkuQty: 0, totalValue: 0, last30DaysUnitSales: 0, byStatus: [] };

  for (const row of rows) {
    const qty = row.availableQty ?? 0;
    const value = toNumber(row.availableQtyValue);
    const sales = row.unitsShippedT30 ?? 0;

    summary.totalSku += 1;
    summary.totalSkuQty += qty;
    summary.totalValue += value;
    summary.last30DaysUnitSales += sales;

    const { bucket, recognised } = bucketForStatus(row.listingStatus);
    if (!recognised && row.listingStatus && row.listingStatus.trim() !== "") unrecognised.add(row.listingStatus.trim());

    const entry = buckets.get(bucket) ?? { status: bucket, totalSku: 0, totalSkuQty: 0, totalValue: 0, last30DaysUnitSales: 0 };
    entry.totalSku += 1;
    entry.totalSkuQty += qty;
    entry.totalValue += value;
    entry.last30DaysUnitSales += sales;
    buckets.set(bucket, entry);
  }

  // Keep the sheet's row order, then anything unrecognised at the end.
  const ordered: StatusTotals[] = [];
  for (const bucket of LISTING_STATUS_BUCKETS) {
    ordered.push(buckets.get(bucket) ?? { status: bucket, totalSku: 0, totalSkuQty: 0, totalValue: 0, last30DaysUnitSales: 0 });
  }
  const other = buckets.get("Other");
  if (other && other.totalSku > 0) ordered.push(other);

  summary.byStatus = ordered;
  summary.totalValue = round2(summary.totalValue);
  for (const s of summary.byStatus) s.totalValue = round2(s.totalValue);
  return summary;
}

function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "object" && v !== null && "toNumber" in (v as never) ? (v as { toNumber: () => number }).toNumber() : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
