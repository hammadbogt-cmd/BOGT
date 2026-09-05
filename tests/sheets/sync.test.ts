import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { ensureSheetConnectionsSeeded, getConnectionsOverview, WORKBOOK_A, WORKBOOK_B } from "@/lib/sheets/connections";
import { syncAllWorkbooks } from "@/lib/sheets/sync";

describe("Google Sheets connection scaffolding (spec section 48)", () => {
  it("seeds both workbook connections with their full tab list", async () => {
    await ensureSheetConnectionsSeeded(prisma);
    const { connections, serviceAccount } = await getConnectionsOverview(prisma);

    expect(serviceAccount.configured).toBe(false); // no credentials in this environment yet — expected

    const a = connections.find((c) => c.workbookName === WORKBOOK_A);
    const b = connections.find((c) => c.workbookName === WORKBOOK_B);
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a!.tabs.map((t) => t.tabName).sort()).toEqual(["All PRODUCTS STATS", "OA USA Products", "Total Listng Status"].sort());
    expect(b!.tabs.map((t) => t.tabName).sort()).toEqual(
      ["BOGT IN Rover Master Stock", "Stock_IN", "Stock_OUT"].sort() // Dashboard tab is validation-only, not imported
    );
  });

  it("never fabricates a successful sync when no credentials are configured — reports CONNECTION_REQUIRED cleanly", async () => {
    const results = await syncAllWorkbooks(prisma);
    expect(results.length).toBeGreaterThanOrEqual(2);
    for (const r of results) {
      expect(r.status).toBe("CONNECTION_REQUIRED");
      expect(r.errors.length).toBeGreaterThan(0);
    }
  });
});
