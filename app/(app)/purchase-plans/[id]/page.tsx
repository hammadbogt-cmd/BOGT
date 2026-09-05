import { notFound } from "next/navigation";
import { getPurchasePlanDetail } from "../../../../lib/queries/purchase-plans";
import { toPlain } from "../../../../lib/serialize";
import { getCurrentUser } from "../../../../lib/auth/current-user";
import { can } from "../../../../lib/auth/permissions";
import { StatusBadge } from "../../../../components/StatusBadge";
import { formatDateTime } from "../../../../lib/format";
import { PlanItemsTable } from "./PlanItemsTable";

export const dynamic = "force-dynamic";

export default async function PurchasePlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [plan, user] = await Promise.all([getPurchasePlanDetail(id), getCurrentUser()]);
  if (!plan) notFound();

  const canApprove = !!user && can(user.role, "approve_purchase_plans");
  const canConvert = !!user && can(user.role, "create_purchase_orders");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{plan.name}</h1>
          <p className="text-sm text-slate-500">
            {plan.items.length} items · Created by {plan.createdByName ?? "system"} on {formatDateTime(plan.createdAt)}
          </p>
        </div>
        <StatusBadge status={plan.status} label={plan.status} />
      </div>

      <PlanItemsTable items={toPlain(plan.items)} canApprove={canApprove} canConvert={canConvert} />
    </div>
  );
}
