import { prisma } from "../prisma";

export interface SearchResults {
  query: string;
  products: {
    id: string;
    title: string;
    brand: string | null;
    primaryBarcode: string | null;
    asin: string | null;
    amazonSku: string | null;
    oaSku: string | null;
    reorderStatus: string;
    profitStatus: string;
  }[];
  suppliers: { id: string; name: string; contactName: string | null }[];
  purchaseOrders: { id: string; poNumber: string; supplierName: string; status: string }[];
  invoices: { id: string; invoiceNumber: string; supplierName: string | null; status: string }[];
  stockMovements: {
    id: string;
    productId: string;
    productTitle: string;
    direction: string;
    invoiceId: string | null;
    shipmentReference: string | null;
    transactionDate: Date;
  }[];
}

/**
 * Global instant search (spec section 28): a single box that matches
 * barcode, ASIN, SKU, title, brand, supplier name, invoice #, PO #, and
 * shipment reference — whichever entity the term actually belongs to.
 */
export async function globalSearch(rawQuery: string): Promise<SearchResults> {
  const query = rawQuery.trim();
  if (!query) {
    return { query, products: [], suppliers: [], purchaseOrders: [], invoices: [], stockMovements: [] };
  }

  const [products, suppliers, purchaseOrders, invoices, stockMovements] = await Promise.all([
    prisma.product.findMany({
      where: {
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { brand: { contains: query, mode: "insensitive" } },
          { primaryBarcode: { contains: query, mode: "insensitive" } },
          { asin: { contains: query, mode: "insensitive" } },
          { amazonSku: { contains: query, mode: "insensitive" } },
          { oaSku: { contains: query, mode: "insensitive" } },
          { supplierSku: { contains: query, mode: "insensitive" } },
          { identifiers: { some: { value: { contains: query, mode: "insensitive" } } } },
        ],
      },
      select: {
        id: true,
        title: true,
        brand: true,
        primaryBarcode: true,
        asin: true,
        amazonSku: true,
        oaSku: true,
        reorderStatus: true,
        profitStatus: true,
      },
      take: 25,
    }),
    prisma.supplier.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { contactName: { contains: query, mode: "insensitive" } },
          { contactEmail: { contains: query, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, contactName: true },
      take: 15,
    }),
    prisma.purchaseOrder.findMany({
      where: {
        OR: [
          { poNumber: { contains: query, mode: "insensitive" } },
          { invoiceReference: { contains: query, mode: "insensitive" } },
        ],
      },
      include: { supplier: true },
      take: 15,
    }),
    prisma.invoice.findMany({
      where: { invoiceNumber: { contains: query, mode: "insensitive" } },
      include: { supplier: true },
      take: 15,
    }),
    prisma.inventoryTransaction.findMany({
      where: {
        OR: [
          { invoiceId: { contains: query, mode: "insensitive" } },
          { shipmentReference: { contains: query, mode: "insensitive" } },
        ],
      },
      include: { product: { select: { title: true } } },
      orderBy: { transactionDate: "desc" },
      take: 25,
    }),
  ]);

  return {
    query,
    products,
    suppliers,
    purchaseOrders: purchaseOrders.map((po) => ({ id: po.id, poNumber: po.poNumber, supplierName: po.supplier.name, status: po.status })),
    invoices: invoices.map((inv) => ({ id: inv.id, invoiceNumber: inv.invoiceNumber, supplierName: inv.supplier?.name ?? null, status: inv.status })),
    stockMovements: stockMovements.map((t) => ({
      id: t.id,
      productId: t.productId,
      productTitle: t.product.title,
      direction: t.direction,
      invoiceId: t.invoiceId,
      shipmentReference: t.shipmentReference,
      transactionDate: t.transactionDate,
    })),
  };
}
