import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../prisma";
import { ALL_SCHEMAS, TargetEntity } from "../import/tab-schemas";
import { getServiceAccountStatus } from "./google-client";

export const WORKBOOK_A = "2026 BOGT AMZ Stock & Prices";
export const WORKBOOK_B = "BOGT in Rover Live Stock 2026";

/**
 * Ensures the two workbook connections and their tab mappings exist (spec
 * section 48: "store the Spreadsheet IDs, tab mappings, column mappings...
 * The mapping should only be configured once"). Safe to call repeatedly —
 * it never overwrites a spreadsheetId or column map that's already set.
 */
export async function ensureSheetConnectionsSeeded(client: PrismaClient = defaultPrisma) {
  for (const workbookName of [WORKBOOK_A, WORKBOOK_B]) {
    const saStatus = getServiceAccountStatus();
    const connection = await client.sheetConnection.upsert({
      where: { workbookName },
      create: {
        workbookName,
        status: saStatus.configured ? "CONNECTION_REQUIRED" : "NOT_CONFIGURED", // still need a spreadsheetId even once the SA exists
      },
      update: {},
    });

    const tabsForWorkbook = ALL_SCHEMAS.filter((s) => s.workbookName === workbookName);
    for (const schema of tabsForWorkbook) {
      await client.sheetTabMapping.upsert({
        where: { sheetConnectionId_tabName: { sheetConnectionId: connection.id, tabName: schema.tabName } },
        create: {
          sheetConnectionId: connection.id,
          tabName: schema.tabName,
          targetEntity: schema.targetEntity,
          columnMap: {}, // resolved on first successful sync, then reused (header-name based, not position based)
          status: "OK",
        },
        update: {},
      });
    }
  }
}

export async function getConnectionsOverview(client: PrismaClient = defaultPrisma) {
  await ensureSheetConnectionsSeeded(client);
  const saStatus = getServiceAccountStatus();
  const connections = await client.sheetConnection.findMany({
    include: { tabs: true },
    orderBy: { workbookName: "asc" },
  });
  return { serviceAccount: saStatus, connections };
}

export function targetEntityForTab(tabName: string): TargetEntity | null {
  const schema = ALL_SCHEMAS.find((s) => s.tabName === tabName);
  return schema ? schema.targetEntity : null;
}
