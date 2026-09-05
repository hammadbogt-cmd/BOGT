"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../lib/prisma";
import { requirePermission } from "../../lib/auth/current-user";
import { recordAudit } from "../../lib/audit";
import { readCsv, readXlsx } from "../../lib/import/sheet-reader";
import { importSupplierPriceList, type SupplierPriceListImportResult } from "../../lib/import/importers/supplier-price-list-importer";
import { recomputeProduct } from "../../lib/engine/recompute";

export interface UploadPriceListState {
  success?: boolean;
  error?: string;
  result?: SupplierPriceListImportResult;
}

/**
 * Supplier Price List upload (spec section 18): parse the file, match every
 * row to an existing product (barcode -> ASIN -> SKU, never title alone),
 * and upsert SupplierProduct + SupplierPriceHistory. Unmatched rows go to
 * the Matching Review queue rather than being silently dropped or merged on
 * a guess.
 */
export async function uploadSupplierPriceListAction(
  _prev: UploadPriceListState,
  formData: FormData
): Promise<UploadPriceListState> {
  try {
    const user = await requirePermission("upload_supplier_price_lists");
    const supplierId = String(formData.get("supplierId") ?? "");
    const file = formData.get("file");

    if (!supplierId) return { error: "Choose a supplier first." };
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };

    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) return { error: "That supplier no longer exists." };

    const buffer = Buffer.from(await file.arrayBuffer());
    const isXlsx = /\.xlsx?$/i.test(file.name) || file.type.includes("spreadsheet") || file.type.includes("excel");
    const sheet = isXlsx ? readXlsx(buffer) : readCsv(buffer);

    if (sheet.rows.length === 0) {
      return { error: "That file has no data rows (or the format couldn't be parsed as CSV/XLSX)." };
    }

    const result = await importSupplierPriceList(
      prisma,
      supplierId,
      sheet,
      `${supplier.name} — ${file.name}`,
      user.id,
      isXlsx ? "XLSX" : "CSV"
    );

    for (const productId of result.affectedProductIds) {
      await recomputeProduct(productId, prisma);
    }

    await recordAudit({
      userId: user.id,
      action: "UPLOAD_SUPPLIER_PRICE_LIST",
      entityType: "Supplier",
      entityId: supplierId,
      newValue: {
        fileName: file.name,
        rowsRead: result.rowsRead,
        created: result.created,
        updated: result.updated,
        unmatched: result.unmatched,
        errors: result.errors,
      },
      source: "import",
      importJobId: result.importJobId,
    });

    revalidatePath("/supplier-price-lists");
    revalidatePath("/suppliers");
    revalidatePath(`/suppliers/${supplierId}`);
    revalidatePath("/matching-review");
    revalidatePath("/reorder-center");
    revalidatePath("/supplier-comparison");

    return { success: true, result };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
