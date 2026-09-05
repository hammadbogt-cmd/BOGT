import { notFound } from "next/navigation";
import { getInvoiceDetail } from "../../../../lib/queries/invoices";
import { toPlain } from "../../../../lib/serialize";
import { getCurrentUser } from "../../../../lib/auth/current-user";
import { can } from "../../../../lib/auth/permissions";
import { StatusBadge } from "../../../../components/StatusBadge";
import { formatDate, formatMoney } from "../../../../lib/format";
import { InvoiceLinesPanel } from "./InvoiceLinesPanel";

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [invoice, user] = await Promise.all([getInvoiceDetail(id), getCurrentUser()]);
  if (!invoice) notFound();

  const canManage = !!user && can(user.role, "manage_invoices");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{invoice.invoiceNumber}</h1>
          <p className="text-sm text-slate-500">
            Supplier: {invoice.supplierName ?? "Unknown"} · {invoice.fileName ?? "no file"}
            {invoice.invoiceDate ? ` · Dated ${formatDate(invoice.invoiceDate)}` : ""} · Total {formatMoney(invoice.totalAmount)}
          </p>
        </div>
        <StatusBadge status={invoice.status} label={invoice.status} />
      </div>

      <InvoiceLinesPanel invoice={toPlain(invoice)} canManage={canManage} />
    </div>
  );
}
