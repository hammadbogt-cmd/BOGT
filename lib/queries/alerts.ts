import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../prisma";

export interface AlertFilters {
  status?: string;
  severity?: string;
  type?: string;
}

export interface AlertRow {
  id: string;
  type: string;
  severity: string;
  status: string;
  productId: string | null;
  productTitle: string | null;
  message: string;
  acknowledgedByName: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
}

export interface AlertsResult {
  rows: AlertRow[];
  counts: { open: number; acknowledged: number; resolved: number; critical: number; warning: number; info: number };
  typeOptions: string[];
}

export async function getAlerts(filters: AlertFilters, client: PrismaClient = defaultPrisma): Promise<AlertsResult> {
  const where: Record<string, unknown> = {};
  if (filters.status) where.status = filters.status;
  if (filters.severity) where.severity = filters.severity;
  if (filters.type) where.type = filters.type;

  const [alerts, allForCounts] = await Promise.all([
    client.alert.findMany({
      where,
      include: { product: { select: { title: true } }, acknowledgedBy: { select: { name: true } } },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: 1000,
    }),
    client.alert.findMany({ select: { status: true, severity: true } }),
  ]);

  const rows: AlertRow[] = alerts.map((a) => ({
    id: a.id,
    type: a.type,
    severity: a.severity,
    status: a.status,
    productId: a.productId,
    productTitle: a.product?.title ?? null,
    message: a.message,
    acknowledgedByName: a.acknowledgedBy?.name ?? null,
    acknowledgedAt: a.acknowledgedAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
  }));

  const counts = {
    open: allForCounts.filter((a) => a.status === "OPEN").length,
    acknowledged: allForCounts.filter((a) => a.status === "ACKNOWLEDGED").length,
    resolved: allForCounts.filter((a) => a.status === "RESOLVED").length,
    critical: allForCounts.filter((a) => a.severity === "CRITICAL" && a.status !== "RESOLVED").length,
    warning: allForCounts.filter((a) => a.severity === "WARNING" && a.status !== "RESOLVED").length,
    info: allForCounts.filter((a) => a.severity === "INFO" && a.status !== "RESOLVED").length,
  };

  const distinctTypes = await client.alert.findMany({ distinct: ["type"], select: { type: true }, orderBy: { type: "asc" } });

  return { rows, counts, typeOptions: distinctTypes.map((t) => t.type) };
}
