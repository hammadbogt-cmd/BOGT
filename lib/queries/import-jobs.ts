import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../prisma";

export async function getRecentImportJobs(tabName: string, limit = 20, client: PrismaClient = defaultPrisma) {
  return client.importJob.findMany({
    where: { tabName },
    orderBy: { startedAt: "desc" },
    take: limit,
    include: { triggeredBy: { select: { name: true, email: true } } },
  });
}
