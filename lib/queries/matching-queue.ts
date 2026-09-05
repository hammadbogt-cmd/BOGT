import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../prisma";

export interface MatchingQueueRow {
  id: string;
  candidateType: string;
  rawIdentifier: string | null;
  rawTitle: string | null;
  rawBrand: string | null;
  confidence: string;
  status: string;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

export async function getMatchingQueue(status: string | undefined, client: PrismaClient = defaultPrisma): Promise<MatchingQueueRow[]> {
  const rows = await client.matchingQueue.findMany({
    where: status ? { status: status as never } : undefined,
    include: { reviewedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  return rows.map((r) => ({
    id: r.id,
    candidateType: r.candidateType,
    rawIdentifier: r.rawIdentifier,
    rawTitle: r.rawTitle,
    rawBrand: r.rawBrand,
    confidence: r.confidence,
    status: r.status,
    reviewedByName: r.reviewedBy?.name ?? null,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
  }));
}

export interface ProductSearchResult {
  id: string;
  title: string;
  primaryBarcode: string | null;
  asin: string | null;
}

export async function searchProductsForMatching(query: string, client: PrismaClient = defaultPrisma): Promise<ProductSearchResult[]> {
  if (!query.trim()) return [];
  const products = await client.product.findMany({
    where: {
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { primaryBarcode: { contains: query } },
        { asin: { contains: query, mode: "insensitive" } },
      ],
    },
    select: { id: true, title: true, primaryBarcode: true, asin: true },
    take: 20,
  });
  return products;
}
