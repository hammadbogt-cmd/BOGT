import { notFound } from "next/navigation";
import { getPurchaseOrderDetail } from "../../../../lib/queries/purchase-orders";
import { toPlain } from "../../../../lib/serialize";
import { getCurrentUser } from "../../../../lib/auth/current-user";
import { can } from "../../../../lib/auth/permissions";
import { StatusBadge } from "../../../../components/StatusBadge";
import { formatDate } from "../../../../lib/format";
import { PurchaseOrderDetailPanel } from "./PurchaseOrderDetailPanel";

export const dynamic = "force-dynamic";

export default async function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [po, user] = await Promise.all([getPurchaseOrderDetail(id), getCurrentUser()]);
  if (!po) notFound();

  const canManage = !!user && can(user.role, "create_purchase_orders");
  const canReceive = !!user && (can(user.role, "manage_stock_movements") || can(user.role, "create_purchase_orders"));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{po.poNumber}</h1>
          <p className="text-sm text-slate-500">
            Supplier: {po.supplierName} · Ordered {formatDate(po.orderDate)}
            {po.expectedDelivery ? ` · Expected ${formatDate(po.expectedDelivery)}` : ""}
            {po.createdByName ? ` · Created by ${po.createdByName}` : ""}
          </p>
        </div>
        <StatusBadge status={po.status} label={po.status} />
      </div>

      <PurchaseOrderDetailPanel po={toPlain(po)} canManage={canManage} canReceive={canReceive} />
    </div>
  );
}
