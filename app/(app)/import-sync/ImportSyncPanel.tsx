"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "../../../components/StatusBadge";
import { formatDateTime, titleCase } from "../../../lib/format";
import { syncAllAction, syncOneWorkbookAction, type SyncActionState } from "../../actions/sync-actions";
import { manualImportAction, setSpreadsheetIdAction, setAutoSyncAction, type ManualImportState, type ConnectionConfigState, type AutoSyncState } from "../../actions/import-sync-actions";

interface TabMapping {
  id: string;
  tabName: string;
  targetEntity: string;
  status: string;
  lastError: string | null;
  lastSyncedAt: string | null;
}

interface Connection {
  id: string;
  workbookName: string;
  spreadsheetId: string | null;
  status: string;
  lastSuccessfulSync: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  autoSyncEnabled: boolean;
  autoSyncInterval: string;
  tabs: TabMapping[];
}

const syncAllInitial: SyncActionState = {};
const manualInitial: ManualImportState = {};

export function ImportSyncPanel({
  overview,
  tabOptions,
}: {
  overview: { serviceAccount: { configured: boolean; clientEmail?: string; error?: string }; connections: Connection[] };
  tabOptions: { targetEntity: string; workbookName: string; tabName: string }[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [syncAllState, syncAllFormAction, syncAllPending] = useActionState(syncAllAction, syncAllInitial);
  const [manualState, manualFormAction, manualPending] = useActionState(manualImportAction, manualInitial);

  useEffect(() => {
    if (syncAllState.results) startTransition(() => router.refresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncAllState.ranAt]);

  useEffect(() => {
    if (manualState.success) startTransition(() => router.refresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualState.success, manualState.result?.importJobId]);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">Google Sheets Service Account</h2>
            <p className="text-xs text-slate-500">
              {overview.serviceAccount.configured
                ? `Connected as ${overview.serviceAccount.clientEmail}`
                : "Not configured — every workbook below will show CONNECTION REQUIRED until GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON is set."}
            </p>
          </div>
          <form action={syncAllFormAction}>
            <button
              type="submit"
              disabled={syncAllPending}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {syncAllPending ? "Syncing..." : "Sync All Latest Data"}
            </button>
          </form>
        </div>
        {syncAllState.error && <p className="mt-2 text-sm text-red-600">{syncAllState.error}</p>}
        {syncAllState.results && (
          <div className="mt-3 flex flex-col gap-2">
            {syncAllState.results.map((r) => (
              <div key={r.connectionId} className="rounded-md border border-slate-200 p-2 text-xs">
                <div className="flex items-center gap-2 font-medium text-slate-700">
                  {r.workbookName} <StatusBadge status={r.status} label={r.status} />
                  <span className="text-slate-400">({r.durationMs}ms)</span>
                </div>
                {r.tabsSynced.length > 0 && <div className="text-slate-500">Tabs synced: {r.tabsSynced.join(", ")}</div>}
                <div className="text-slate-500">
                  Added {r.productsAdded} · Updated {r.productsUpdated} · Price changes {r.priceChanges} · Stock changes {r.stockChanges} · Unmatched{" "}
                  {r.unmatchedProducts}
                </div>
                {r.errors.length > 0 && <div className="text-red-600">{r.errors.join("; ")}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {overview.connections.map((conn) => (
          <ConnectionCard key={conn.id} connection={conn} />
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Manual Upload</h2>
        <form action={manualFormAction} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Tab
            <select
              name="targetEntity"
              required
              onChange={(e) => {
                const opt = tabOptions.find((t) => t.targetEntity === e.target.value);
                const hiddenInput = document.querySelector<HTMLInputElement>('input[name="workbookName"]');
                if (hiddenInput && opt) hiddenInput.value = opt.workbookName;
              }}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">Choose a tab...</option>
              {tabOptions.map((t) => (
                <option key={t.targetEntity} value={t.targetEntity}>
                  {t.workbookName} / {t.tabName}
                </option>
              ))}
            </select>
          </label>
          <input type="hidden" name="workbookName" />
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            File (CSV or XLSX)
            <input name="file" type="file" accept=".csv,.xlsx,.xls" required className="text-sm" />
          </label>
          <button
            type="submit"
            disabled={manualPending}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {manualPending ? "Importing..." : "Upload & Import"}
          </button>
        </form>
        {manualState.error && <p className="mt-2 text-sm text-red-600">{manualState.error}</p>}
        {manualState.result && (
          <div className="mt-3 rounded-md border border-slate-200 p-3 text-xs">
            <div className="flex items-center gap-2 font-medium">
              Status <StatusBadge status={manualState.result.status} label={manualState.result.status} />
            </div>
            {manualState.result.mappingIssue && (
              <div className="mt-1 text-red-600">Missing required column(s): {manualState.result.mappingIssue.missingRequired.join(", ")}</div>
            )}
            <div className="mt-1 text-slate-500">
              Rows read {manualState.result.counters.rowsRead} · Created {manualState.result.counters.rowsCreated} · Updated{" "}
              {manualState.result.counters.rowsUpdated} · Unmatched {manualState.result.counters.unmatchedProducts} · Errors{" "}
              {manualState.result.counters.errorCount}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ConnectionCard({ connection }: { connection: Connection }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [syncState, syncAction, syncPending] = useActionState(syncOneWorkbookAction, {} as SyncActionState);
  const [configState, configAction, configPending] = useActionState(setSpreadsheetIdAction, {} as ConnectionConfigState);
  const [autoSyncState, autoSyncAction, autoSyncPending] = useActionState(setAutoSyncAction, {} as AutoSyncState);
  const [spreadsheetId, setSpreadsheetId] = useState(connection.spreadsheetId ?? "");

  useEffect(() => {
    if (syncState.results || configState.success || autoSyncState.success) startTransition(() => router.refresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncState.ranAt, configState.success, autoSyncState.success]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{connection.workbookName}</h3>
          <p className="text-xs text-slate-500">
            {connection.lastSuccessfulSync ? `Last synced ${formatDateTime(connection.lastSuccessfulSync)}` : "Never synced"}
            {connection.lastError ? ` · ${connection.lastError}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={connection.status} label={titleCase(connection.status)} />
          <form action={syncAction}>
            <input type="hidden" name="connectionId" value={connection.id} />
            <button
              type="submit"
              disabled={syncPending}
              className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {syncPending ? "Syncing..." : "Sync This Workbook"}
            </button>
          </form>
        </div>
      </div>

      <form action={configAction} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="connectionId" value={connection.id} />
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Spreadsheet ID
          <input
            name="spreadsheetId"
            value={spreadsheetId}
            onChange={(e) => setSpreadsheetId(e.target.value)}
            placeholder="1AbCdEfG... (from the Google Sheets URL)"
            className="w-72 rounded-md border border-slate-300 px-2 py-1 text-xs"
          />
        </label>
        <button
          type="submit"
          disabled={configPending}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {configPending ? "Saving..." : "Repair Mapping"}
        </button>
        {configState.error && <span className="text-xs text-red-600">{configState.error}</span>}
      </form>

      <form action={autoSyncAction} className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <input type="hidden" name="connectionId" value={connection.id} />
        <label className="flex items-center gap-1">
          <input type="checkbox" name="autoSyncEnabled" value="true" defaultChecked={connection.autoSyncEnabled} />
          Auto-sync
        </label>
        <select name="autoSyncInterval" defaultValue={connection.autoSyncInterval} className="rounded-md border border-slate-300 px-2 py-1 text-xs">
          <option value="MANUAL_ONLY">Manual only</option>
          <option value="HOURLY_1">Every hour</option>
          <option value="HOURLY_3">Every 3 hours</option>
          <option value="HOURLY_6">Every 6 hours</option>
          <option value="HOURLY_12">Every 12 hours</option>
          <option value="DAILY">Daily</option>
        </select>
        <button type="submit" disabled={autoSyncPending} className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50">
          {autoSyncPending ? "Saving..." : "Save"}
        </button>
      </form>

      <div className="mt-3 overflow-x-auto rounded-md border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-slate-500">Tab</th>
              <th className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-slate-500">Target Entity</th>
              <th className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-slate-500">Status</th>
              <th className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-slate-500">Last Synced</th>
              <th className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-slate-500">Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {connection.tabs.map((tab) => (
              <tr key={tab.id}>
                <td className="px-2 py-1">{tab.tabName}</td>
                <td className="px-2 py-1">{titleCase(tab.targetEntity)}</td>
                <td className="px-2 py-1">
                  <StatusBadge status={tab.status} label={tab.status} />
                </td>
                <td className="px-2 py-1">{formatDateTime(tab.lastSyncedAt)}</td>
                <td className="px-2 py-1 text-red-600">{tab.lastError ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
