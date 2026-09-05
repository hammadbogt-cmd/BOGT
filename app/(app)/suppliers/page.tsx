import { getSuppliersList } from "../../../lib/queries/suppliers";
import { toPlain } from "../../../lib/serialize";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { can } from "../../../lib/auth/permissions";
import { SuppliersTable } from "./SuppliersTable";
import { NewSupplierForm } from "./NewSupplierForm";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const [rows, user] = await Promise.all([getSuppliersList(), getCurrentUser()]);
  const canManage = !!user && can(user.role, "manage_suppliers");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Suppliers</h1>
          <p className="text-sm text-slate-500">Every supplier, their lead time and tie-break priority, and lifetime spend.</p>
        </div>
        {canManage && <NewSupplierForm />}
      </div>

      <SuppliersTable rows={toPlain(rows)} />
    </div>
  );
}
