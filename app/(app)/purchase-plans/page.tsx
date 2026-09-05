import { getPurchasePlansList } from "../../../lib/queries/purchase-plans";
import { toPlain } from "../../../lib/serialize";
import { PurchasePlansTable } from "./PurchasePlansTable";

export const dynamic = "force-dynamic";

export default async function PurchasePlansPage() {
  const rows = await getPurchasePlansList();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Purchase Plans</h1>
        <p className="text-sm text-slate-500">
          Every reorder plan, including the Quick Reorder List built from &quot;Add to Reorder&quot;. Open a plan to set final
          quantities, assign suppliers, approve, and convert to Purchase Orders.
        </p>
      </div>

      <PurchasePlansTable rows={toPlain(rows)} />
    </div>
  );
}
