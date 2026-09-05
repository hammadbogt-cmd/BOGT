/**
 * Seeds realistic sample data matching the exact source-tab shapes described
 * in the spec, so every screen and calculation can be exercised end-to-end
 * before real Google Sheets exports are connected. Includes a deliberate
 * set of "QA Validation" products that each exercise one of the 25
 * validation scenarios from spec section 44, so they're easy to find and
 * check by hand in the running app.
 */
import "dotenv/config";
import { faker } from "@faker-js/faker";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { DEFAULT_SETTINGS, SETTINGS_KEY } from "../lib/calc/settings";
import { recomputeAllProducts } from "../lib/engine/recompute";
import { ensureSheetConnectionsSeeded } from "../lib/sheets/connections";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

faker.seed(42); // deterministic sample data across re-seeds

const BRANDS = [
  "Aurora Home",
  "Nimbus Kitchen",
  "Vantage Sports",
  "Cedar & Oak",
  "Pulse Electronics",
  "Meridian Beauty",
  "Northline Tools",
  "Sable Living",
  "Zephyr Outdoors",
  "Crestwood Baby",
];

const CATEGORIES = [
  "Storage Organizer",
  "Kitchen Utensil Set",
  "Resistance Bands",
  "Wooden Cutting Board",
  "USB-C Charging Cable",
  "Facial Roller",
  "Cordless Screwdriver",
  "Throw Pillow Cover",
  "Camping Lantern",
  "Baby Bottle Warmer",
  "Yoga Mat",
  "LED Desk Lamp",
  "Stainless Steel Water Bottle",
  "Car Phone Mount",
  "Silicone Baking Mat",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randBarcode(): string {
  return faker.string.numeric(13);
}

function randAsin(): string {
  return "B0" + faker.string.alphanumeric({ length: 8, casing: "upper" });
}

async function main() {
  console.log("Seeding: settings, users, locations, suppliers...");

  await prisma.setting.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value: DEFAULT_SETTINGS as object, description: "Core business rule configuration" },
    update: {},
  });

  const locations = ["AMAZON", "ROVER", "OFFICE", "INCOMING_PO"] as const;
  const locationNames: Record<(typeof locations)[number], string> = {
    AMAZON: "Amazon FBA",
    ROVER: "Rover Warehouse",
    OFFICE: "Office",
    INCOMING_PO: "Incoming Purchase Orders",
  };
  for (const code of locations) {
    await prisma.inventoryLocation.upsert({ where: { code }, create: { code, name: locationNames[code] }, update: {} });
  }

  const users = [
    { email: "admin@bogt.local", name: "Admin User", role: "ADMIN" as const },
    { email: "purchasing@bogt.local", name: "Purchasing Lead", role: "PURCHASING" as const },
    { email: "warehouse@bogt.local", name: "Warehouse Lead", role: "WAREHOUSE" as const },
    { email: "finance@bogt.local", name: "Finance Lead", role: "FINANCE" as const },
    { email: "viewer@bogt.local", name: "Read Only Viewer", role: "VIEWER" as const },
  ];
  const passwordHash = await bcrypt.hash("ChangeMe123!", 10);
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      create: { email: u.email, name: u.name, role: u.role, passwordHash },
      update: {},
    });
  }
  const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: "admin@bogt.local" } });

  const supplierSeed = [
    { name: "BOGT", leadTimeDays: 5, priority: 10, currency: "AED" },
    { name: "Rover Island", leadTimeDays: 3, priority: 20, currency: "AED" },
    { name: "Supplier C", leadTimeDays: 10, priority: 30, currency: "AED" },
    { name: "Brand Direct", leadTimeDays: 21, priority: 40, currency: "AED" },
    { name: "Other Suppliers", leadTimeDays: 14, priority: 90, currency: "AED" },
  ];
  const suppliers = [];
  for (const s of supplierSeed) {
    suppliers.push(
      await prisma.supplier.upsert({
        where: { name: s.name },
        create: { ...s, moq: randInt(1, 20), casePack: randInt(1, 12), lastUpdateAt: new Date() },
        update: {},
      })
    );
  }

  await ensureSheetConnectionsSeeded(prisma);

  console.log("Seeding: random catalog products...");
  const RANDOM_PRODUCT_COUNT = 220;
  const randomProductIds: string[] = [];

  for (let i = 0; i < RANDOM_PRODUCT_COUNT; i++) {
    const brand = pick(BRANDS);
    const category = pick(CATEGORIES);
    const catalogSource = i % 4 === 0 ? "OA_USA" : "AMAZON_MAIN";
    const bsr = faker.number.int({ weight: "exponential" } as never) ?? randInt(300, 400000);
    const bsrFinal = randInt(300, 400000);
    const cost = Number(faker.commerce.price({ min: 8, max: 90 }));
    const markup = faker.number.float({ min: 1.3, max: 3.2, fractionDigits: 2 });
    const sellingPrice = Math.round(cost * markup * 100) / 100;
    const t30 = Math.max(0, Math.round(faker.number.float({ min: 0, max: bsrFinal < 5000 ? 120 : 60 })));
    const amazonQty = randInt(0, 6) === 0 ? 0 : randInt(1, 250); // ~15% OOS on Amazon
    const roverQty = randInt(0, 150);
    const officeQty = randInt(0, 0) === 0 && Math.random() < 0.15 ? randInt(1, 30) : 0;
    const barcode = randBarcode();
    const asin = randAsin();
    const sku = catalogSource === "OA_USA" ? `OA-${faker.string.alphanumeric({ length: 8, casing: "upper" })}` : `AMZ-${faker.string.alphanumeric({ length: 6, casing: "upper" })}`;

    const product = await prisma.product.create({
      data: {
        title: `${brand} ${category} - ${faker.commerce.productAdjective()} ${faker.string.alphanumeric({ length: 4, casing: "upper" })}`,
        brand,
        catalogSource: catalogSource as never,
        primaryBarcode: barcode,
        asin,
        amazonSku: catalogSource === "AMAZON_MAIN" ? sku : undefined,
        oaSku: catalogSource === "OA_USA" ? sku : undefined,
        bsr: bsrFinal,
        unitsShippedT30: t30,
        lastMonthSale: t30,
        amazonAvailableQty: amazonQty,
        amazonReservedQty: randInt(0, 5),
        amazonInboundQty: randInt(0, 20),
        amazonUnfulfillableQty: randInt(0, 2),
        roverQty,
        officeQty,
        buyBoxPrice: sellingPrice,
        ourPrice: sellingPrice,
        currentCost: cost,
        currentCostWithVat: Math.round(cost * 1.05 * 100) / 100,
        shelfLocation: `R-${randInt(1, 12)}-${randInt(1, 40)}`,
        qtyPerBox: randInt(6, 48),
        totalBoxes: randInt(0, 10),
      },
    });

    await prisma.productIdentifier.createMany({
      data: [
        { productId: product.id, type: "BARCODE_PRIMARY", value: barcode },
        { productId: product.id, type: "ASIN", value: asin },
        { productId: product.id, type: catalogSource === "OA_USA" ? "OA_SKU" : "AMAZON_SKU", value: sku },
      ],
      skipDuplicates: true,
    });

    // 60% of products get 1-3 supplier offers, so supplier comparison has real data.
    if (Math.random() < 0.6) {
      const numOffers = randInt(1, 3);
      const chosen = faker.helpers.arrayElements(suppliers, numOffers);
      for (const supplier of chosen) {
        const priceVariance = faker.number.float({ min: 0.85, max: 1.15, fractionDigits: 3 });
        await prisma.supplierProduct.create({
          data: {
            supplierId: supplier.id,
            productId: product.id,
            price: Math.round(cost * priceVariance * 100) / 100,
            stockQty: randInt(0, 200),
            moq: randInt(1, 20),
            leadTimeDays: supplier.leadTimeDays,
            currency: "AED",
          },
        });
      }
    }

    // Purchase history: 1-4 Stock_IN transactions over the past ~9 months, cost drifting realistically.
    const numPurchases = randInt(1, 4);
    let runningCost = cost * faker.number.float({ min: 0.85, max: 1.1 });
    let lifetimeQty = 0;
    let purchaseCount = 0;
    let firstPurchaseDate: Date | null = null;
    let lastPurchaseDate: Date | null = null;
    let lowest = runningCost;
    let highest = runningCost;
    let weightedSum = 0;

    for (let p = 0; p < numPurchases; p++) {
      const daysAgo = randInt(5, 270) - p * 60;
      const date = new Date(Date.now() - Math.max(daysAgo, 2) * 24 * 60 * 60 * 1000);
      const qty = randInt(20, 150);
      const oldCost = runningCost;
      runningCost = Math.round(runningCost * faker.number.float({ min: 0.95, max: 1.08 }) * 100) / 100;

      const fingerprintSource = `stock_in|${date.toISOString().slice(0, 10)}|inv-${product.id}-${p}|${barcode}|${qty}`;
      const fingerprint = require("node:crypto").createHash("sha256").update(fingerprintSource).digest("hex");

      const roverLoc = await prisma.inventoryLocation.findUniqueOrThrow({ where: { code: "ROVER" } });
      const supplierForTxn = pick(suppliers);

      await prisma.inventoryTransaction.create({
        data: {
          productId: product.id,
          locationId: roverLoc.id,
          direction: "IN",
          sourceType: "STOCK_IN",
          qty,
          transactionDate: date,
          invoiceId: `INV-${faker.string.numeric(5)}`,
          newCostPrice: runningCost,
          oldCostPrice: oldCost,
          brand,
          productTitleRaw: product.title,
          barcodeRaw: barcode,
          fingerprint,
          supplierId: supplierForTxn.id,
        },
      });

      await prisma.purchaseHistory.create({
        data: {
          productId: product.id,
          transactionId: fingerprint,
          date,
          invoiceId: `INV-${faker.string.numeric(5)}`,
          supplierId: supplierForTxn.id,
          supplierName: supplierForTxn.name,
          barcodeRaw: barcode,
          qty,
          newCost: runningCost,
          previousCost: oldCost,
          priceDiff: runningCost - oldCost,
          priceDiffPct: oldCost ? (runningCost - oldCost) / oldCost : null,
          source: "seed",
        },
      });

      lifetimeQty += qty;
      purchaseCount += 1;
      if (!firstPurchaseDate || date < firstPurchaseDate) firstPurchaseDate = date;
      if (!lastPurchaseDate || date > lastPurchaseDate) lastPurchaseDate = date;
      lowest = Math.min(lowest, runningCost);
      highest = Math.max(highest, runningCost);
      weightedSum += runningCost * qty;
    }

    await prisma.product.update({
      where: { id: product.id },
      data: {
        currentCost: runningCost,
        currentCostWithVat: Math.round(runningCost * 1.05 * 100) / 100,
        lastPurchaseCost: runningCost,
        lastPurchaseDate,
        firstPurchaseDate,
        purchaseCount,
        lifetimePurchasedQty: lifetimeQty,
        lowestHistoricalCost: lowest,
        highestHistoricalCost: highest,
        weightedAvgCost: lifetimeQty > 0 ? weightedSum / lifetimeQty : runningCost,
        roverQty: roverQty, // keep the balance we already assigned; transactions above are historical color
      },
    });

    const roverLoc = await prisma.inventoryLocation.findUniqueOrThrow({ where: { code: "ROVER" } });
    await prisma.inventoryBalance.upsert({
      where: { productId_locationId: { productId: product.id, locationId: roverLoc.id } },
      create: { productId: product.id, locationId: roverLoc.id, qty: roverQty },
      update: { qty: roverQty },
    });
    if (officeQty > 0) {
      const officeLoc = await prisma.inventoryLocation.findUniqueOrThrow({ where: { code: "OFFICE" } });
      await prisma.inventoryBalance.upsert({
        where: { productId_locationId: { productId: product.id, locationId: officeLoc.id } },
        create: { productId: product.id, locationId: officeLoc.id, qty: officeQty },
        update: { qty: officeQty },
      });
    }

    // A handful of Stock_OUT (FBA shipment) events for movement-history realism.
    if (Math.random() < 0.7) {
      const numShipments = randInt(1, 3);
      for (let s = 0; s < numShipments; s++) {
        const daysAgo = randInt(1, 60);
        const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
        const qty = Math.min(randInt(5, 40), 500);
        const shipmentRef = `FBA${faker.string.numeric(6)}`;
        const fingerprint = require("node:crypto")
          .createHash("sha256")
          .update(`stock_out|${date.toISOString().slice(0, 10)}|${barcode}|${qty}|${shipmentRef}`)
          .digest("hex");
        await prisma.inventoryTransaction.create({
          data: {
            productId: product.id,
            locationId: roverLoc.id,
            direction: "OUT",
            sourceType: "STOCK_OUT",
            qty,
            transactionDate: date,
            shipmentReference: shipmentRef,
            fcDestination: pick(["DXB3", "DXB4", "AUH2"]),
            brand,
            productTitleRaw: product.title,
            barcodeRaw: barcode,
            fingerprint,
          },
        });
      }
    }

    randomProductIds.push(product.id);
  }

  console.log("Seeding: hand-crafted QA validation products (spec section 44)...");
  await seedValidationCases(suppliers);

  console.log("Recomputing profitability, reorder recommendations, and stock status for all products...");
  const processed = await recomputeAllProducts(prisma);
  console.log(`Recomputed ${processed} products.`);

  console.log("Seed complete.");
  console.log(`  Users: ${users.map((u) => u.email).join(", ")} (password: ChangeMe123!)`);
  console.log(`  Products: ${randomProductIds.length} random + validation-case set`);
}

async function seedValidationCases(suppliers: { id: string; name: string }[]) {
  const roverLoc = await prisma.inventoryLocation.findUniqueOrThrow({ where: { code: "ROVER" } });
  const officeLoc = await prisma.inventoryLocation.findUniqueOrThrow({ where: { code: "OFFICE" } });
  const supplierByName = (name: string) => suppliers.find((s) => s.name === name)!;

  type Case = {
    title: string;
    bsr: number | null;
    t30: number;
    amazonQty: number;
    roverQty: number;
    officeQty: number;
    incomingQty?: number;
    cost: number;
    sellingPrice: number;
    supplierOffers?: { supplier: string; price: number; stockQty: number; leadTimeDays?: number; moq?: number }[];
  };

  const cases: Case[] = [
    { title: "QA1 Amazon OOS Product", bsr: 3000, t30: 40, amazonQty: 0, roverQty: 0, officeQty: 0, cost: 20, sellingPrice: 45 },
    { title: "QA2 Near-OOS Product", bsr: 4000, t30: 60, amazonQty: 12, roverQty: 0, officeQty: 0, cost: 18, sellingPrice: 42 },
    { title: "QA3 BSR<=5000 with 40 T30 sales", bsr: 2800, t30: 40, amazonQty: 5, roverQty: 5, officeQty: 0, cost: 20, sellingPrice: 45 },
    { title: "QA4 BSR<=5000 with 45 T30 sales", bsr: 2800, t30: 45, amazonQty: 5, roverQty: 5, officeQty: 0, cost: 20, sellingPrice: 45 },
    { title: "QA5 BSR<=5000 with 50 T30 sales", bsr: 2800, t30: 50, amazonQty: 5, roverQty: 5, officeQty: 0, cost: 20, sellingPrice: 45 },
    { title: "QA6 BSR<=5000 with 70 T30 sales (never capped at 50)", bsr: 2800, t30: 70, amazonQty: 4, roverQty: 3, officeQty: 0, cost: 20, sellingPrice: 45 },
    { title: "QA7 BSR>5000 with 35 T30 sales (conservative rule)", bsr: 8000, t30: 35, amazonQty: 5, roverQty: 5, officeQty: 0, cost: 20, sellingPrice: 45 },
    { title: "QA8 Enough Rover stock to fully cover demand", bsr: 6000, t30: 20, amazonQty: 0, roverQty: 40, officeQty: 0, cost: 15, sellingPrice: 35 },
    { title: "QA9 Office stock counts toward availability", bsr: 6000, t30: 20, amazonQty: 0, roverQty: 0, officeQty: 40, cost: 15, sellingPrice: 35 },
    { title: "QA10 Confirmed incoming PO reduces requirement", bsr: 6000, t30: 20, amazonQty: 0, roverQty: 0, officeQty: 0, incomingQty: 30, cost: 15, sellingPrice: 35 },
    {
      title: "QA11 Stock split across Amazon, Rover, Office, and Incoming",
      bsr: 4500,
      t30: 100,
      amazonQty: 10,
      roverQty: 20,
      officeQty: 15,
      incomingQty: 5,
      cost: 22,
      sellingPrice: 55,
    },
    {
      title: "QA12 Profitable supplier price",
      bsr: 9000,
      t30: 30,
      amazonQty: 3,
      roverQty: 2,
      officeQty: 0,
      cost: 20,
      sellingPrice: 60,
      supplierOffers: [{ supplier: "BOGT", price: 20, stockQty: 100 }],
    },
    {
      title: "QA13 Loss-making supplier price",
      bsr: 9000,
      t30: 30,
      amazonQty: 3,
      roverQty: 2,
      officeQty: 0,
      cost: 24,
      sellingPrice: 25,
      supplierOffers: [{ supplier: "BOGT", price: 24, stockQty: 100 }],
    },
    {
      title: "QA14 Supplier price increase vs history",
      bsr: 7000,
      t30: 25,
      amazonQty: 8,
      roverQty: 10,
      officeQty: 0,
      cost: 26,
      sellingPrice: 55,
      supplierOffers: [{ supplier: "BOGT", price: 26, stockQty: 60 }],
    },
    {
      title: "QA15 Supplier price decrease vs history",
      bsr: 7000,
      t30: 25,
      amazonQty: 8,
      roverQty: 10,
      officeQty: 0,
      cost: 17,
      sellingPrice: 45,
      supplierOffers: [{ supplier: "BOGT", price: 17, stockQty: 60 }],
    },
    {
      title: "QA16 Same product from multiple suppliers",
      bsr: 4200,
      t30: 55,
      amazonQty: 2,
      roverQty: 2,
      officeQty: 0,
      cost: 22,
      sellingPrice: 60,
      supplierOffers: [
        { supplier: "BOGT", price: 22, stockQty: 50, leadTimeDays: 5 },
        { supplier: "Rover Island", price: 24, stockQty: 100, leadTimeDays: 3 },
        { supplier: "Supplier C", price: 21.5, stockQty: 30, leadTimeDays: 7 },
      ],
    },
    { title: "QA17 Alternate barcode match (see identifiers)", bsr: 5500, t30: 15, amazonQty: 10, roverQty: 10, officeQty: 0, cost: 12, sellingPrice: 30 },
    { title: "QA20 Stock_IN transaction realism check", bsr: 6500, t30: 20, amazonQty: 5, roverQty: 30, officeQty: 0, cost: 19, sellingPrice: 42 },
    { title: "QA21 Stock_OUT transaction realism check", bsr: 6500, t30: 20, amazonQty: 5, roverQty: 30, officeQty: 0, cost: 19, sellingPrice: 42 },
    {
      title: "QA22 Purchase price history trend",
      bsr: 5000,
      t30: 20,
      amazonQty: 5,
      roverQty: 15,
      officeQty: 0,
      cost: 21,
      sellingPrice: 48,
    },
  ];

  for (const c of cases) {
    const barcode = randBarcode();
    const asin = randAsin();
    const sku = `AMZ-${faker.string.alphanumeric({ length: 6, casing: "upper" })}`;

    const product = await prisma.product.create({
      data: {
        title: c.title,
        brand: "QA Validation",
        catalogSource: "AMAZON_MAIN",
        primaryBarcode: barcode,
        asin,
        amazonSku: sku,
        bsr: c.bsr ?? undefined,
        unitsShippedT30: c.t30,
        lastMonthSale: c.t30,
        amazonAvailableQty: c.amazonQty,
        amazonReservedQty: 0,
        amazonInboundQty: 0,
        amazonUnfulfillableQty: 0,
        roverQty: c.roverQty,
        officeQty: c.officeQty,
        incomingPoQty: c.incomingQty ?? 0,
        buyBoxPrice: c.sellingPrice,
        ourPrice: c.sellingPrice,
        currentCost: c.cost,
        currentCostWithVat: Math.round(c.cost * 1.05 * 100) / 100,
        lastPurchaseCost: c.cost,
        lowestHistoricalCost: c.cost * 0.9,
        highestHistoricalCost: c.cost * 1.1,
        weightedAvgCost: c.cost,
        purchaseCount: 2,
        lifetimePurchasedQty: 100,
        firstPurchaseDate: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
        lastPurchaseDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      },
    });

    await prisma.productIdentifier.createMany({
      data: [
        { productId: product.id, type: "BARCODE_PRIMARY", value: barcode },
        { productId: product.id, type: "ASIN", value: asin },
        { productId: product.id, type: "AMAZON_SKU", value: sku },
      ],
      skipDuplicates: true,
    });

    if (c.title.startsWith("QA17")) {
      // Give it a second, alternate barcode so the matching engine has something to demonstrate.
      await prisma.productIdentifier.create({
        data: { productId: product.id, type: "BARCODE_ALTERNATE", value: randBarcode() },
      });
    }

    await prisma.inventoryBalance.upsert({
      where: { productId_locationId: { productId: product.id, locationId: roverLoc.id } },
      create: { productId: product.id, locationId: roverLoc.id, qty: c.roverQty },
      update: { qty: c.roverQty },
    });
    if (c.officeQty > 0) {
      await prisma.inventoryBalance.upsert({
        where: { productId_locationId: { productId: product.id, locationId: officeLoc.id } },
        create: { productId: product.id, locationId: officeLoc.id, qty: c.officeQty },
        update: { qty: c.officeQty },
      });
    }

    if (c.supplierOffers) {
      for (const offer of c.supplierOffers) {
        const supplier = supplierByName(offer.supplier);
        await prisma.supplierProduct.create({
          data: {
            supplierId: supplier.id,
            productId: product.id,
            price: offer.price,
            stockQty: offer.stockQty,
            leadTimeDays: offer.leadTimeDays ?? 7,
            moq: offer.moq ?? 1,
            currency: "AED",
          },
        });
        await prisma.supplierPriceHistory.create({
          data: {
            supplierProductId: (
              await prisma.supplierProduct.findFirstOrThrow({ where: { supplierId: supplier.id, productId: product.id } })
            ).id,
            price: offer.price * 0.9,
            effectiveDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
            source: "seed",
          },
        });
      }
    }

    // Two Stock_IN events with a clear cost trend, so purchase-history + price-change detection has something real.
    const dates = [200, 10].map((d) => new Date(Date.now() - d * 24 * 60 * 60 * 1000));
    const costs = c.title.startsWith("QA15") ? [c.cost * 1.3, c.cost] : [c.cost * 0.9, c.cost];
    for (let i = 0; i < dates.length; i++) {
      const fingerprint = require("node:crypto")
        .createHash("sha256")
        .update(`stock_in|${dates[i].toISOString().slice(0, 10)}|inv-${product.id}-${i}|${barcode}|50`)
        .digest("hex");
      await prisma.inventoryTransaction.create({
        data: {
          productId: product.id,
          locationId: roverLoc.id,
          direction: "IN",
          sourceType: "STOCK_IN",
          qty: 50,
          transactionDate: dates[i],
          invoiceId: `INV-QA-${faker.string.numeric(4)}`,
          newCostPrice: costs[i],
          oldCostPrice: i > 0 ? costs[i - 1] : undefined,
          brand: "QA Validation",
          productTitleRaw: product.title,
          barcodeRaw: barcode,
          fingerprint,
          supplierId: supplierByName("BOGT").id,
        },
      });
      await prisma.purchaseHistory.create({
        data: {
          productId: product.id,
          transactionId: fingerprint,
          date: dates[i],
          invoiceId: `INV-QA-${faker.string.numeric(4)}`,
          supplierId: supplierByName("BOGT").id,
          supplierName: "BOGT",
          barcodeRaw: barcode,
          qty: 50,
          newCost: costs[i],
          previousCost: i > 0 ? costs[i - 1] : undefined,
          priceDiff: i > 0 ? costs[i] - costs[i - 1] : undefined,
          priceDiffPct: i > 0 ? (costs[i] - costs[i - 1]) / costs[i - 1] : undefined,
          source: "seed",
        },
      });
    }

    // QA21: a deterministic Stock_OUT (FBA shipment) transaction — validation case 21 needs a real,
    // immutable outgoing movement to assert against, not just the generic randomized shipments the
    // bulk-seeded catalog gets. Rover balance is seeded at 30 for this case; this records a real
    // 12-unit shipment out of it, leaving 18 as the current balance.
    if (c.title.startsWith("QA21")) {
      const outDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const shipmentRef = "FBA-QA21-000001";
      const outFingerprint = require("node:crypto")
        .createHash("sha256")
        .update(`stock_out|${outDate.toISOString().slice(0, 10)}|${barcode}|12|${shipmentRef}`)
        .digest("hex");
      await prisma.inventoryTransaction.create({
        data: {
          productId: product.id,
          locationId: roverLoc.id,
          direction: "OUT",
          sourceType: "STOCK_OUT",
          qty: 12,
          transactionDate: outDate,
          shipmentReference: shipmentRef,
          fcDestination: "DXB3",
          brand: "QA Validation",
          productTitleRaw: product.title,
          barcodeRaw: barcode,
          fingerprint: outFingerprint,
        },
      });
      const newRoverQty = c.roverQty - 12;
      await prisma.product.update({ where: { id: product.id }, data: { roverQty: newRoverQty } });
      await prisma.inventoryBalance.update({
        where: { productId_locationId: { productId: product.id, locationId: roverLoc.id } },
        data: { qty: newRoverQty },
      });
    }
  }

  // QA18: unknown barcode with no product match at all — lives only in the Matching Review queue.
  await prisma.matchingQueue.create({
    data: {
      candidateType: "supplier_upload",
      rawIdentifier: randBarcode(),
      rawTitle: "QA18 Unknown Barcode Supplier Row",
      rawBrand: "Unknown Brand Co",
      confidence: "LOW",
      metadata: { reason: "NO_IDENTIFIER_MATCH", seed: true },
    },
  });

  // QA19: duplicate barcode conflict — two distinct products claim the same barcode.
  const dupBarcode = randBarcode();
  const dupA = await prisma.product.create({ data: { title: "QA19a Duplicate Barcode Owner", brand: "QA Validation", primaryBarcode: dupBarcode } });
  await prisma.productIdentifier.create({ data: { productId: dupA.id, type: "BARCODE_PRIMARY", value: dupBarcode } });
  const dupB = await prisma.product.create({ data: { title: "QA19b Duplicate Barcode Claimant", brand: "QA Validation" } });
  await prisma.alert.create({
    data: {
      type: "DUPLICATE_BARCODE",
      severity: "WARNING",
      productId: dupB.id,
      message: `Barcode ${dupBarcode} is already assigned to "${dupA.title}" — registration was blocked, not overwritten.`,
      metadata: { conflictingProductId: dupA.id, barcode: dupBarcode },
    },
  });

  // QA25: negative inventory condition captured as a standing alert against a real product.
  const negProduct = await prisma.product.create({
    data: { title: "QA25 Negative Inventory Condition", brand: "QA Validation", roverQty: -5, primaryBarcode: randBarcode() },
  });
  await prisma.alert.create({
    data: {
      type: "NEGATIVE_WAREHOUSE_STOCK",
      severity: "CRITICAL",
      productId: negProduct.id,
      message: "Rover balance is negative (-5) — a Stock_OUT exceeded recorded Stock_IN history. Needs manual reconciliation.",
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
