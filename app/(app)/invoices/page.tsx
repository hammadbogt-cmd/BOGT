import { prisma } from "../../../lib/prisma";
import { getInvoicesList } from "../../../lib/queries/invoices";
import { toPlain } from "../../../lib/serialize";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { can } from "../../../lib/auth/permissions";
import { UploadInvoiceForm } from "./UploadInvoiceForm";
import { InvoicesTable } from "./InvoicesTable";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const [rows, suppliers, user] = await Promise.all([
    getInvoicesList(),
    prisma.supplier.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getCurrentUser(),
  ]);

  const canUpload = !!user && can(user.role, "manage_invoices");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Invoice Checker</h1>
        <p className="text-sm text-slate-500">
          Upload a supplier invoice to compare every line against what the product should cost, before you pay it.
        </p>
      </div>

      {canUpload && <UploadInvoiceForm suppliers={toPlain(suppliers)} />}

      <InvoicesTable rows={toPlain(rows)} />
    </div>
  );
}
