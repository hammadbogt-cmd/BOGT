import { notFound } from "next/navigation";
import { getSupplierDetail } from "../../../../lib/queries/suppliers";
import { toPlain } from "../../../../lib/serialize";
import { getCurrentUser } from "../../../../lib/auth/current-user";
import { can } from "../../../../lib/auth/permissions";
import { formatMoney, formatNumber } from "../../../../lib/format";
import { EditSupplierForm } from "./EditSupplierForm";
import { SupplierProductsTable } from "./SupplierProductsTable";
import { SupplierPurchaseHistoryTable } from "./SupplierPurchaseHistoryTable";

export const dynamic = "force-dynamic";

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [supplier, user] = await Promise.all([getSupplierDetail(id), getCurrentUser()]);
  if (!supplier) notFound();
  const canEdit = !!user && can(user.role, "manage_suppliers");

  const data = toPlain(supplier);

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">{data.name}</h1>
        <p className="text-sm text-slate-500">
          {formatNumber(data.products.length)} active product offers · {formatMoney(data.totalSpend)} lifetime spend
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Contact &amp; Terms</h2>
        <EditSupplierForm supplier={data} canEdit={canEdit} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Products Supplied</h2>
        <SupplierProductsTable rows={data.products} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Purchase History From This Supplier</h2>
        <SupplierPurchaseHistoryTable rows={data.purchaseHistory} />
      </div>
    </div>
  );
}
