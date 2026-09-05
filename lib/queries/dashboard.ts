import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../prisma";
import { getSettings } from "../settings-store";

export interface KpiCard {
  key: string;
  label: string;
  value: string;
  href: string;
  tone?: "default" | "danger" | "warning" | "success";
}

export interface DashboardData {
  kpis: KpiCard[];
  charts: {
    inventoryValueByBrand: { name: string; value: number }[];
    stockByLocation: { name: string; value: number }[];
    stockHealthDistribution: { name: string; value: number }[];
    bsrDistribution: { name: string; value: number }[];
    salesDistribution: { name: string; value: number }[];
    profitabilityDistribution: { name: string; value: number }[];
  };
  lastUpdated: string;
}

const num = (v: unknown): number => {
  if (v === null || v === undefined) return 0;
  if (typeof v === "object" && "toNumber" in (v as never)) return (v as { toNumber: () => number }).toNumber();
  return Number(v) || 0;
};

export async function getDashboardData(client: PrismaClient = defaultPrisma): Promise<DashboardData> {
  const settings = await getSettings(client);

  const products = await client.product.findMany({
    select: {
      id: true,
      brand: true,
      bsr: true,
      unitsShippedT30: true,
      amazonAvailableQty: true,
      roverQty: true,
      officeQty: true,
      incomingPoQty: true,
      currentCost: true,
      inventoryValue: true,
      profitStatus: true,
      reorderStatus: true,
      listingStatus: true,
      preferredSupplierId: true,
      reorderRecs: {
        where: { isLatest: true },
        select: { stockStatus: true, priority: true, daysOfStock: true },
      },
      supplierProducts: { select: { id: true }, take: 1 },
    },
  });

  const [uniqueBarcodes, uniqueAsins] = await Promise.all([
    client.productIdentifier.findMany({
      where: { type: { in: ["BARCODE_PRIMARY", "BARCODE_ALTERNATE", "BARCODE_PREVIOUS", "BARCODE_SUPPLIER"] } },
      distinct: ["value"],
      select: { value: true },
    }),
    client.productIdentifier.findMany({ where: { type: "ASIN" }, distinct: ["value"], select: { value: true } }),
  ]);

  let totalAmazon = 0;
  let totalRover = 0;
  let totalOffice = 0;
  let totalIncoming = 0;
  let totalInventoryValue = 0;
  let totalAmazonValue = 0;
  let totalWarehouseValue = 0;
  let oosCount = 0;
  let nearOosCount = 0;
  let reorderRequiredCount = 0;
  let highPriorityCount = 0;
  let lossMakingCount = 0;
  let lowProfitCount = 0;
  let fastMovingCount = 0;
  let slowMovingCount = 0;
  let noSalesCount = 0;
  let noSupplierCount = 0;
  let supplierReorderOpportunities = 0;

  const brandValue = new Map<string, number>();
  const bsrBuckets = new Map<string, number>();
  const salesBuckets = new Map<string, number>();
  const profitBuckets = new Map<string, number>();
  const healthBuckets = new Map<string, number>();

  const BSR_BUCKETS: [number, number, string][] = [
    [0, 1000, "0-1k"],
    [1000, 5000, "1k-5k"],
    [5000, 20000, "5k-20k"],
    [20000, 100000, "20k-100k"],
    [100000, Infinity, "100k+"],
  ];
  const SALES_BUCKETS: [number, number, string][] = [
    [0, 0, "0"],
    [1, 10, "1-10"],
    [11, 30, "11-30"],
    [31, 60, "31-60"],
    [61, Infinity, "60+"],
  ];

  for (const p of products) {
    const cost = num(p.currentCost);
    totalAmazon += p.amazonAvailableQty;
    totalRover += p.roverQty;
    totalOffice += p.officeQty;
    totalIncoming += p.incomingPoQty;
    totalInventoryValue += num(p.inventoryValue);
    totalAmazonValue += p.amazonAvailableQty * cost;
    totalWarehouseValue += (p.roverQty + p.officeQty) * cost;

    if (p.brand) brandValue.set(p.brand, (brandValue.get(p.brand) ?? 0) + num(p.inventoryValue));

    const rec = p.reorderRecs[0];
    const stockStatus = rec?.stockStatus ?? "HEALTHY";
    healthBuckets.set(stockStatus, (healthBuckets.get(stockStatus) ?? 0) + 1);
    if (stockStatus === "OOS") oosCount++;
    if (stockStatus === "NEAR_OOS") nearOosCount++;

    if (p.reorderStatus === "REORDER_REQUIRED" || p.reorderStatus === "HIGH_PRIORITY_REORDER" || p.reorderStatus === "NEAR_OOS")
      reorderRequiredCount++;
    if (p.reorderStatus === "HIGH_PRIORITY_REORDER" || (rec?.priority === "CRITICAL")) highPriorityCount++;
    if (p.reorderStatus !== "NO_REORDER" && p.supplierProducts.length > 0) supplierReorderOpportunities++;

    if (p.profitStatus === "LOSS") lossMakingCount++;
    if (p.profitStatus === "LOW_PROFIT") lowProfitCount++;
    profitBuckets.set(p.profitStatus, (profitBuckets.get(p.profitStatus) ?? 0) + 1);

    const t30 = p.unitsShippedT30 ?? 0;
    if (t30 >= settings.highSalesThreshold) fastMovingCount++;
    else if (t30 === 0) noSalesCount++;
    else if (t30 > 0 && t30 < settings.highSalesThreshold / 3) slowMovingCount++;

    if (p.supplierProducts.length === 0) noSupplierCount++;

    const bsrBucket = BSR_BUCKETS.find(([min, max]) => (p.bsr ?? Infinity) >= min && (p.bsr ?? Infinity) < max);
    if (bsrBucket) bsrBuckets.set(bsrBucket[2], (bsrBuckets.get(bsrBucket[2]) ?? 0) + 1);

    const salesBucket = SALES_BUCKETS.find(([min, max]) => t30 >= min && t30 <= max);
    if (salesBucket) salesBuckets.set(salesBucket[2], (salesBuckets.get(salesBucket[2]) ?? 0) + 1);
  }

  const totalBusinessUnits = totalAmazon + totalRover + totalOffice + totalIncoming;

  const kpis: KpiCard[] = [
    { key: "total_products", label: "Total Products", value: products.length.toLocaleString(), href: "/products" },
    { key: "unique_barcodes", label: "Total Unique Barcodes", value: uniqueBarcodes.length.toLocaleString(), href: "/products" },
    { key: "unique_asins", label: "Total ASINs", value: uniqueAsins.length.toLocaleString(), href: "/products" },
    { key: "amazon_units", label: "Total Amazon Units", value: totalAmazon.toLocaleString(), href: "/inventory/amazon" },
    { key: "rover_units", label: "Total Rover Warehouse Units", value: totalRover.toLocaleString(), href: "/inventory/warehouse" },
    { key: "office_units", label: "Total Office Units", value: totalOffice.toLocaleString(), href: "/inventory/warehouse" },
    { key: "business_units", label: "Total Business Inventory Units", value: totalBusinessUnits.toLocaleString(), href: "/products" },
    { key: "inventory_value", label: "Total Inventory Cost Value", value: money(totalInventoryValue), href: "/products" },
    { key: "amazon_value", label: "Total Amazon Inventory Value", value: money(totalAmazonValue), href: "/inventory/amazon" },
    { key: "warehouse_value", label: "Total Warehouse Inventory Value", value: money(totalWarehouseValue), href: "/inventory/warehouse" },
    { key: "oos", label: "OOS Products", value: oosCount.toLocaleString(), href: "/reorder-center?filter=oos", tone: "danger" },
    { key: "near_oos", label: "Near OOS Products", value: nearOosCount.toLocaleString(), href: "/reorder-center?filter=near_oos", tone: "warning" },
    { key: "reorder_required", label: "Reorder Required", value: reorderRequiredCount.toLocaleString(), href: "/reorder-center?filter=recommended", tone: "warning" },
    { key: "high_priority", label: "High Priority Reorders", value: highPriorityCount.toLocaleString(), href: "/reorder-center?filter=high_priority", tone: "danger" },
    { key: "loss_making", label: "Loss-Making Products", value: lossMakingCount.toLocaleString(), href: "/products?filter=loss_making", tone: "danger" },
    { key: "low_profit", label: "Low Profit Products", value: lowProfitCount.toLocaleString(), href: "/products?filter=low_profit", tone: "warning" },
    { key: "fast_moving", label: "Fast-Moving Products", value: fastMovingCount.toLocaleString(), href: "/products?filter=fast_moving", tone: "success" },
    { key: "slow_moving", label: "Slow-Moving Products", value: slowMovingCount.toLocaleString(), href: "/products?filter=slow_moving" },
    { key: "no_sales", label: "Products With No Sales", value: noSalesCount.toLocaleString(), href: "/products?filter=no_sales" },
    { key: "no_supplier", label: "Products With No Supplier", value: noSupplierCount.toLocaleString(), href: "/products?filter=no_supplier" },
    {
      key: "supplier_reorder_opportunities",
      label: "Supplier Reorder Opportunities",
      value: supplierReorderOpportunities.toLocaleString(),
      href: "/reorder-center?filter=supplier_available",
      tone: "success",
    },
  ];

  const charts = {
    inventoryValueByBrand: [...brandValue.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value]) => ({ name, value: Math.round(value) })),
    stockByLocation: [
      { name: "Amazon", value: totalAmazon },
      { name: "Rover", value: totalRover },
      { name: "Office", value: totalOffice },
      { name: "Incoming PO", value: totalIncoming },
    ],
    stockHealthDistribution: [...healthBuckets.entries()].map(([name, value]) => ({ name, value })),
    bsrDistribution: BSR_BUCKETS.map(([, , label]) => ({ name: label, value: bsrBuckets.get(label) ?? 0 })),
    salesDistribution: SALES_BUCKETS.map(([, , label]) => ({ name: label, value: salesBuckets.get(label) ?? 0 })),
    profitabilityDistribution: [...profitBuckets.entries()].map(([name, value]) => ({ name, value })),
  };

  return { kpis, charts, lastUpdated: new Date().toISOString() };
}

function money(n: number): string {
  return `AED ${Math.round(n).toLocaleString()}`;
}
