"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../lib/prisma";
import { requirePermission } from "../../lib/auth/current-user";
import { recordAudit } from "../../lib/audit";
import { readCsv, readXlsx } from "../../lib/import/sheet-reader";
import { importInvoice, type InvoiceImportResult } from "../../lib/import/importers/invoice-importer";
import { parseDateOrNull } from "../../lib/import/value-parsers";

export interface UploadInvoiceState {
  success?: boolean;
  error?: string;
  result?: InvoiceImportResult;
}

/**
 * Invoice Checker upload (spec section 25): parse a supplier invoice
 * spreadsheet, match every line to a product, and classify each line by
 * comparing the invoiced price against the reference-price priority (last
 * purchase -> master cost -> weighted average -> lowest historical), never
 * silently accepting a price bump.
 */
export async function uploadInvoiceAction(_prev: UploadInvoiceState, formData: FormData): Promise<UploadInvoiceState> {
  try {
    const user = await requirePermission("manage_invoices");
    const invoiceNumber = String(formData.get("invoiceNumber") ?? "").trim();
    const supplierId = formData.get("supplierId") ? String(formData.get("supplierId")) : null;
    const invoiceDateRaw = formData.get("invoiceDate") ? String(formData.get("invoiceDate")) : null;
    const file = formData.get("file");

    if (!invoiceNumber) return { error: "Enter an invoice number first." };
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };

    const buffer = Buffer.from(await file.arrayBuffer());
    const isXlsx = /\.xlsx?$/i.test(file.name) || file.type.includes("spreadsheet") || file.type.includes("excel");
    const sheet = isXlsx ? readXlsx(buffer) : readCsv(buffer);

    if (sheet.rows.length === 0) {
      return { error: "That file has no data rows (or the format couldn't be parsed as CSV/XLSX)." };
    }

    const result = await importInvoice(
      prisma,
      {
        supplierId,
        invoiceNumber,
        invoiceDate: invoiceDateRaw ? parseDateOrNull(invoiceDateRaw) : null,
        fileName: file.name,
        fileType: isXlsx ? "XLSX" : "CSV",
      },
      sheet,
      user.id
    );

    await recordAudit({
      userId: user.id,
      action: "UPLOAD_INVOICE",
      entityType: "Invoice",
      entityId: result.invoiceId,
      newValue: { invoiceNumber, fileName: file.name, rowsRead: result.rowsRead, matched: result.matched, unmatched: result.unmatched, errors: result.errors },
      source: "import",
    });

    revalidatePath("/invoices");
    revalidatePath("/matching-review");

    return { success: true, result };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export interface InvoiceStatusState {
  success?: boolean;
  error?: string;
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  REVIEWED: ["APPROVED", "REJECTED"],
  APPROVED: ["RECEIVED", "REJECTED"],
  MATCHING: ["APPROVED", "REJECTED"],
  UPLOADED: ["APPROVED", "REJECTED"],
};

export async function setInvoiceStatusAction(_prev: InvoiceStatusState, formData: FormData): Promise<InvoiceStatusState> {
  try {
    const user = await requirePermission("manage_invoices");
    const invoiceId = String(formData.get("invoiceId"));
    const status = String(formData.get("status"));

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const allowed = ALLOWED_TRANSITIONS[invoice.status] ?? [];
    if (!allowed.includes(status)) {
      return { error: `Cannot move from ${invoice.status} to ${status}.` };
    }

    await prisma.invoice.update({ where: { id: invoiceId }, data: { status: status as never } });

    await recordAudit({
      userId: user.id,
      action: "SET_INVOICE_STATUS",
      entityType: "Invoice",
      entityId: invoiceId,
      oldValue: { status: invoice.status },
      newValue: { status },
      source: "ui",
    });

    revalidatePath(`/invoices/${invoiceId}`);
    revalidatePath("/invoices");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
