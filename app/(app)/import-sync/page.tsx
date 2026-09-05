import { redirect } from "next/navigation";
import { getConnectionsOverview } from "../../../lib/sheets/connections";
import { ALL_SCHEMAS } from "../../../lib/import/tab-schemas";
import { toPlain } from "../../../lib/serialize";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { can } from "../../../lib/auth/permissions";
import { ImportSyncPanel } from "./ImportSyncPanel";

export const dynamic = "force-dynamic";

export default async function ImportSyncPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "run_sheet_sync")) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Your role ({user.role}) does not have access to Import &amp; Sync.
      </div>
    );
  }

  const overview = await getConnectionsOverview();
  const tabOptions = ALL_SCHEMAS.map((s) => ({ targetEntity: s.targetEntity, workbookName: s.workbookName, tabName: s.tabName }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Import &amp; Sync</h1>
        <p className="text-sm text-slate-500">
          Connection status for the two Google Sheets workbooks, plus manual CSV/XLSX upload for any tab — both go through
          the identical import pipeline, so behavior never diverges between &quot;upload a file&quot; and &quot;click Sync&quot;.
        </p>
      </div>

      <ImportSyncPanel overview={toPlain(overview)} tabOptions={tabOptions} />
    </div>
  );
}
