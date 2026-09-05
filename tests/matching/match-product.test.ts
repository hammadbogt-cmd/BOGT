import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { matchProduct, registerIdentifier } from "@/lib/matching/match-product";

// These are integration tests against the real (local dev) Postgres database.
// Each test creates its own uniquely-prefixed products and cleans them up.

const PREFIX = "TEST_MATCH_";

async function cleanup() {
  await prisma.productIdentifier.deleteMany({ where: { product: { title: { startsWith: PREFIX } } } });
  await prisma.product.deleteMany({ where: { title: { startsWith: PREFIX } } });
}

beforeAll(cleanup);
afterAll(cleanup);

describe("matchProduct (spec sections 3-4)", () => {
  it("validation case 17: matches on an alternate barcode, not just the primary one", async () => {
    const product = await prisma.product.create({
      data: {
        title: `${PREFIX}Widget A`,
        primaryBarcode: "8800256114665",
        identifiers: {
          create: [
            { type: "BARCODE_PRIMARY", value: "8800256114665" },
            { type: "BARCODE_ALTERNATE", value: "8800256108374" },
          ],
        },
      },
    });

    const result = await matchProduct(prisma, { barcode: "8800256108374" });
    expect(result.productId).toBe(product.id);
    expect(result.confidence).toBe("HIGH");
    expect(result.matchedBy).toBe("BARCODE");
  });

  it("validation case 18: an unknown barcode with no ASIN/SKU match is routed to manual review, never auto-merged", async () => {
    await prisma.product.create({
      data: {
        title: `${PREFIX}Widget B`,
        identifiers: { create: [{ type: "BARCODE_PRIMARY", value: "1111111111111" }] },
      },
    });

    const result = await matchProduct(prisma, { barcode: "9999999999999", title: `${PREFIX}Widget B Clone` });
    expect(result.productId).toBeNull();
    expect(result.needsManualReview).toBe(true);
  });

  it("falls back from barcode to ASIN to SKU in priority order", async () => {
    const product = await prisma.product.create({
      data: {
        title: `${PREFIX}Widget C`,
        identifiers: { create: [{ type: "ASIN", value: "B0TESTASIN1" }] },
      },
    });

    const result = await matchProduct(prisma, { asin: "b0testasin1" }); // lowercase input must still normalize+match
    expect(result.productId).toBe(product.id);
    expect(result.confidence).toBe("HIGH");
    expect(result.matchedBy).toBe("ASIN");
  });

  it("SKU match is MEDIUM confidence, lower than barcode/ASIN's HIGH", async () => {
    const product = await prisma.product.create({
      data: {
        title: `${PREFIX}Widget D`,
        identifiers: { create: [{ type: "OA_SKU", value: "OA-TESTSKU1" }] },
      },
    });

    const result = await matchProduct(prisma, { oaSku: "oa-testsku1" });
    expect(result.productId).toBe(product.id);
    expect(result.confidence).toBe("MEDIUM");
  });

  it("never matches on title similarity alone", async () => {
    await prisma.product.create({ data: { title: `${PREFIX}Exact Same Title Widget` } });
    const result = await matchProduct(prisma, { title: `${PREFIX}Exact Same Title Widget` });
    expect(result.productId).toBeNull();
    expect(result.needsManualReview).toBe(true);
  });
});

describe("registerIdentifier — duplicate barcode detection (validation case 19)", () => {
  it("flags a conflict instead of silently reassigning a barcode already owned by another product", async () => {
    const productA = await prisma.product.create({ data: { title: `${PREFIX}Owner A` } });
    const productB = await prisma.product.create({ data: { title: `${PREFIX}Owner B` } });

    const first = await registerIdentifier(prisma, productA.id, "BARCODE_PRIMARY", "5551234567890");
    expect(first).toBe("created");

    const conflict = await registerIdentifier(prisma, productB.id, "BARCODE_PRIMARY", "5551234567890");
    expect(conflict).toBe("conflict");

    const stillOwnedByA = await prisma.productIdentifier.findUnique({
      where: { type_value: { type: "BARCODE_PRIMARY", value: "5551234567890" } },
    });
    expect(stillOwnedByA?.productId).toBe(productA.id);
  });

  it("registering the same identifier on the same product twice is idempotent", async () => {
    const product = await prisma.product.create({ data: { title: `${PREFIX}Idempotent` } });
    const first = await registerIdentifier(prisma, product.id, "ASIN", "B0IDEMPOTENT");
    const second = await registerIdentifier(prisma, product.id, "ASIN", "B0IDEMPOTENT");
    expect(first).toBe("created");
    expect(second).toBe("already_linked");
  });
});
