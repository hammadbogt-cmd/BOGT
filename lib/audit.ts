import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "./prisma";

export interface AuditParams {
  userId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  source?: "ui" | "import" | "sync" | "api";
  importJobId?: string | null;
}

/** Every financially/inventory-significant change should call this (spec section 32). */
export async function recordAudit(params: AuditParams, client: PrismaClient = defaultPrisma) {
  await client.auditLog.create({
    data: {
      userId: params.userId ?? undefined,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? undefined,
      oldValue: (params.oldValue ?? undefined) as object | undefined,
      newValue: (params.newValue ?? undefined) as object | undefined,
      source: params.source ?? "ui",
      importJobId: params.importJobId ?? undefined,
    },
  });
}
