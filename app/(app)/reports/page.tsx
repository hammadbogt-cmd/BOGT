import { redirect } from "next/navigation";
import { getInventoryValuationReport } from "../../../lib/queries/reports";
import { toPlain } from "../../../lib/serialize";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { can } from "../../../lib/auth/permissions";
import { REPORT_CATALOG } from "../../../lib/reports-catalog";
import { ReportsView } from "./ReportsView";

export const dynamic = "force-dynamic";

const DEFAULT_REPORT_KEY = "valuation";

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "export_reports")) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Your role ({user.role}) does not have access to Reports.
      </div>
    );
  }

  // Only the default report is fetched on page load; the rest of the section-36
  // catalog is loaded on demand (see app/actions/report-actions.ts) so opening
  // Reports doesn't mean fetching ~25 reports' worth of rows across ~3,000+ products.
  const initialData = toPlain(await getInventoryValuationReport());

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500">The full section-36 report catalog: inventory, stock status, profitability, and supplier/purchasing — every report exportable to CSV.</p>
      </div>

      <ReportsView catalog={REPORT_CATALOG} initialKey={DEFAULT_REPORT_KEY} initialData={initialData} />
    </div>
  );
}
