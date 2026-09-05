import type { PrismaClient, IdentifierType } from "@prisma/client";
import { normalizeAsin, normalizeBarcode, normalizeSku } from "./normalize";

export type MatchConfidence = "HIGH" | "MEDIUM" | "LOW" | "NONE";
export type MatchedBy = "BARCODE" | "ASIN" | "SKU" | "NONE";

export interface MatchCandidateInput {
  barcode?: string | null;
  alternateBarcodes?: string[];
  asin?: string | null;
  amazonSku?: string | null;
  oaSku?: string | null;
  supplierSku?: string | null;
  title?: string | null;
  brand?: string | null;
}

export interface MatchResult {
  productId: string | null;
  confidence: MatchConfidence;
  matchedBy: MatchedBy;
  matchedValue: string | null;
  /** True when no exact identifier matched and the row should be routed to
   * the Matching Review queue rather than auto-merged on title similarity. */
  needsManualReview: boolean;
}

const BARCODE_TYPES = ["BARCODE_PRIMARY", "BARCODE_ALTERNATE", "BARCODE_PREVIOUS", "BARCODE_SUPPLIER"] as const;

/**
 * Identity matching priority (spec sections 3-4):
 *   1. Exact barcode match (any of primary/alternate/previous/supplier barcode) -> HIGH
 *   2. Exact ASIN match                                                          -> HIGH
 *   3. Exact SKU match (amazon/OA/supplier SKU)                                   -> MEDIUM
 *   4. No exact identifier match -> route to Matching Review. Title/brand
 *      similarity is NEVER used to auto-merge; it only appears in the review
 *      queue as a hint for a human to confirm.
 */
export async function matchProduct(prisma: PrismaClient, input: MatchCandidateInput): Promise<MatchResult> {
  const barcodesToTry = [
    normalizeBarcode(input.barcode),
    ...(input.alternateBarcodes ?? []).map(normalizeBarcode),
  ].filter((b): b is string => !!b);

  for (const barcode of barcodesToTry) {
    const found = await prisma.productIdentifier.findFirst({
      where: { type: { in: BARCODE_TYPES as unknown as IdentifierType[] }, value: barcode },
    });
    if (found) {
      return {
        productId: found.productId,
        confidence: "HIGH",
        matchedBy: "BARCODE",
        matchedValue: barcode,
        needsManualReview: false,
      };
    }
  }

  const asin = normalizeAsin(input.asin);
  if (asin) {
    const found = await prisma.productIdentifier.findFirst({ where: { type: "ASIN", value: asin } });
    if (found) {
      return { productId: found.productId, confidence: "HIGH", matchedBy: "ASIN", matchedValue: asin, needsManualReview: false };
    }
  }

  const skusToTry = [normalizeSku(input.amazonSku), normalizeSku(input.oaSku), normalizeSku(input.supplierSku)].filter(
    (s): s is string => !!s
  );
  for (const sku of skusToTry) {
    const found = await prisma.productIdentifier.findFirst({
      where: { type: { in: ["AMAZON_SKU", "OA_SKU", "SUPPLIER_SKU"] }, value: sku },
    });
    if (found) {
      return { productId: found.productId, confidence: "MEDIUM", matchedBy: "SKU", matchedValue: sku, needsManualReview: false };
    }
  }

  return { productId: null, confidence: "NONE", matchedBy: "NONE", matchedValue: null, needsManualReview: true };
}

/**
 * Registers an identifier against a product, detecting duplicate-barcode
 * conflicts instead of silently overwriting another product's identity.
 * Returns "conflict" (and does NOT write) when the identifier already
 * belongs to a different product — callers should raise a DUPLICATE_BARCODE
 * alert and/or a Matching Review entry rather than merge automatically.
 */
export async function registerIdentifier(
  prisma: PrismaClient,
  productId: string,
  type:
    | "BARCODE_PRIMARY"
    | "BARCODE_ALTERNATE"
    | "BARCODE_PREVIOUS"
    | "BARCODE_SUPPLIER"
    | "ASIN"
    | "AMAZON_SKU"
    | "OA_SKU"
    | "SUPPLIER_SKU",
  value: string,
  source?: string
): Promise<"created" | "already_linked" | "conflict"> {
  const existing = await prisma.productIdentifier.findUnique({ where: { type_value: { type, value } } });
  if (existing) {
    if (existing.productId === productId) return "already_linked";

    // Raise a DUPLICATE_BARCODE alert on the claimant (not the owner) rather
    // than silently overwriting who owns this identifier (spec: "never
    // silently overwrite" — see the QA19 fixture for the expected shape).
    if (BARCODE_TYPES.includes(type as (typeof BARCODE_TYPES)[number])) {
      const alreadyFlagged = await prisma.alert.findFirst({
        where: { productId, type: "DUPLICATE_BARCODE", status: { in: ["OPEN", "ACKNOWLEDGED"] }, metadata: { path: ["value"], equals: value } },
      });
      if (!alreadyFlagged) {
        await prisma.alert.create({
          data: {
            productId,
            type: "DUPLICATE_BARCODE",
            severity: "CRITICAL",
            status: "OPEN",
            message: `Barcode ${value} is already claimed by another product — this product's identifier was not written.`,
            metadata: { value, type, owningProductId: existing.productId, source: source ?? undefined },
          },
        });
      }
    }
    return "conflict";
  }
  await prisma.productIdentifier.create({ data: { productId, type, value, source } });
  return "created";
}
