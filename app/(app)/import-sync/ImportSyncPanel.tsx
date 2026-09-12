"use client";

import { Fragment, useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "../../../components/StatusBadge";
import { formatDateTime, titleCase } from "../../../lib/format";
import { syncAllAction, syncOneWorkbookAction, type SyncActionState } from "../../actions/sync-actions";
import type { SyncSummary, TabSyncDetail } from "../../../lib/sheets/sync";
import {
  manualImportAction,
  setSpreadsheetIdAction,
  setAutoSyncAction,
  setHeaderRowAction,
  type ManualImportState,
  type ConnectionConfigState,
  type AutoSyncState,
  type TabConfigState,
} from "../../actions/import-sync-actions";

interface TabMapping {
  id: string;
  tabName: string;
  targetEntity: string;
  status: string;
  lastError: string | null;
  lastSyncedAt: string | null;
  headerRow: number;
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
              <SyncResultCard key={r.connectionId} result={r} />
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
              <div className="mt-1 text-red-600">
                <div>Missing required column(s): {manualState.result.mappingIssue.missingRequired.join(", ")}</div>
                <div className="mt-0.5 text-[11px]">
                  Read row {manualState.result.mappingIssue.headerRow} as the header row, which contains:{" "}
                  {manualState.result.mappingIssue.headersSeen.slice(0, 15).join(" | ") || "(blank)"}
                </div>
              </div>
            )}
            {manualState.result.headerRow != null && !manualState.result.mappingIssue && (
              <div className="mt-1 text-slate-500">
                Headers read from row {manualState.result.headerRow} · {Object.keys(manualState.result.columnMap ?? {}).length} columns matched
                {manualState.result.unmatchedHeaders && manualState.result.unmatchedHeaders.length > 0
                  ? ` · ignored: ${manualState.result.unmatchedHeaders.join(", ")}`
                  : ""}
              </div>
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

/**
 * The full result of one workbook sync: headline counters, then a per-tab
 * breakdown that says which row the headers were found on, which columns
 * were matched, what was ignored, and the first row-level errors — so a
 * failure can be understood here rather than in server logs.
 */
function SyncResultCard({ result }: { result: SyncSummary }) {
  const [openTab, setOpenTab] = useState<string | null>(null);

  return (
    <div className="rounded-md border border-slate-200 p-2 text-xs">
      <div className="flex flex-wrap items-center gap-2 font-medium text-slate-700">
        {result.workbookName} <StatusBadge status={result.status} label={result.status} />
        <span className="text-slate-400">({(result.durationMs / 1000).toFixed(1)}s)</span>
      </div>
      <div className="mt-1 text-slate-500">
        Rows read {result.productsChecked.toLocaleString()} · Added {result.productsAdded} · Updated {result.productsUpdated} · Price changes{" "}
        {result.priceChanges} · Stock changes {result.stockChanges} · Unmatched {result.unmatchedProducts}
        {result.newStockInTxns ? ` · Stock IN ${result.newStockInTxns}` : ""}
        {result.newStockOutTxns ? ` · Stock OUT ${result.newStockOutTxns}` : ""}
      </div>
      {result.recomputedProducts != null && (
        <div className="text-slate-400">
          Recalculated {result.recomputedProducts.toLocaleString()} product{result.recomputedProducts === 1 ? "" : "s"} in{" "}
          {((result.recomputeMs ?? 0) / 1000).toFixed(1)}s
        </div>
      )}

      {result.errors.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-red-600">
          {result.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}

      {result.tabs && result.tabs.length > 0 && (
        <div className="mt-2 overflow-hidden rounded border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-1 text-left font-semibold">Tab</th>
                <th className="px-2 py-1 text-left font-semibold">Result</th>
                <th className="px-2 py-1 text-right font-semibold">Header row</th>
                <th className="px-2 py-1 text-right font-semibold">Read</th>
                <th className="px-2 py-1 text-right font-semibold">New</th>
                <th className="px-2 py-1 text-right font-semibold">Updated</th>
                <th className="px-2 py-1 text-right font-semibold">Skipped</th>
                <th className="px-2 py-1 text-right font-semibold">Errors</th>
                <th className="px-2 py-1 text-right font-semibold">Time</th>
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {result.tabs.map((tab) => (
                <Fragment key={tab.tabName}>
                  <tr className={tab.status === "OK" ? "" : "bg-red-50"}>
                    <td className="px-2 py-1 font-medium text-slate-700">{tab.tabName}</td>
                    <td className="px-2 py-1">
                      <StatusBadge status={tab.status} label={tab.status} />
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">{tab.headerRow ?? "—"}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{tab.rowsRead.toLocaleString()}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{tab.rowsCreated.toLocaleString()}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{tab.rowsUpdated.toLocaleString()}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{tab.rowsSkipped.toLocaleString()}</td>
                    <td className={`px-2 py-1 text-right tabular-nums ${tab.errorCount > 0 ? "font-semibold text-red-600" : ""}`}>
                      {tab.errorCount}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-slate-400">{(tab.durationMs / 1000).toFixed(1)}s</td>
                    <td className="px-2 py-1 text-right">
                      <button
                        type="button"
                        onClick={() => setOpenTab(openTab === tab.tabName ? null : tab.tabName)}
                        className="text-slate-500 underline hover:text-slate-800"
                      >
                        {openTab === tab.tabName ? "Hide" : "Details"}
                      </button>
                    </td>
                  </tr>
                  {openTab === tab.tabName && (
                    <tr>
                      <td colSpan={10} className="bg-slate-50 px-3 py-2">
                        <TabDiagnostics tab={tab} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TabDiagnostics({ tab }: { tab: TabSyncDetail }) {
  const mapped = Object.entries(tab.mappedColumns ?? {});
  return (
    <div className="flex flex-col gap-2 text-[11px] text-slate-600">
      {tab.error && <div className="rounded border border-red-200 bg-red-50 p-2 text-red-700">{tab.error}</div>}

      {tab.missingRequired && tab.missingRequired.length > 0 && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-red-700">
          <div className="font-semibold">Required column(s) not found: {tab.missingRequired.join(", ")}</div>
          <div className="mt-1">
            Row {tab.headerRow} was read as the header row. Rename the matching column in the sheet, or check the header row is where you expect.
          </div>
        </div>
      )}

      {tab.headersSeen && tab.headersSeen.length > 0 && (
        <div>
          <span className="font-semibold text-slate-700">Headers found on row {tab.headerRow}:</span> {tab.headersSeen.join(" | ")}
        </div>
      )}

      {mapped.length > 0 && (
        <div>
          <div className="font-semibold text-slate-700">Columns used ({mapped.length}):</div>
          <div className="mt-0.5 grid gap-x-4 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
            {mapped.map(([field, header]) => (
              <div key={field} className="truncate">
                <span className="text-slate-500">{field}</span> ← <span className="font-medium text-slate-700">{header}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab.unmatchedHeaders && tab.unmatchedHeaders.length > 0 && (
        <div>
          <span className="font-semibold text-slate-700">Ignored columns:</span> {tab.unmatchedHeaders.join(", ")}
          <span className="text-slate-400"> (present in the sheet, not used by this tab — harmless)</span>
        </div>
      )}

      {tab.sampleRowErrors && tab.sampleRowErrors.length > 0 && (
        <div>
          <div className="font-semibold text-slate-700">First row problems:</div>
          <ul className="mt-0.5 list-disc pl-4">
            {tab.sampleRowErrors.map((e, i) => (
              <li key={i}>
                Row {e.rowNumber}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab.unmatchedProducts > 0 && (
        <div className="text-amber-700">
          {tab.unmatchedProducts} row(s) had no matching product and were sent to Matching Review rather than guessed at.
        </div>
      )}
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

      {syncState.error && <p className="mt-2 text-xs text-red-600">{syncState.error}</p>}
      {syncState.results?.map((r) => (
        <div key={r.connectionId} className="mt-3">
          <SyncResultCard result={r} />
        </div>
      ))}

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
              <th
                className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-slate-500"
                title="Detected automatically on each sync — the row your column headings are on. Editable if you ever need to force it."
              >
                Header Row
              </th>
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
                <td className="px-2 py-1">
                  <HeaderRowControl tabId={tab.id} headerRow={tab.headerRow} />
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

/**
 * Which row of the source tab holds the real column headers (1-based).
 * Defaults to 1; set to 2+ when the sheet has a summary/totals row above
 * the actual header row (that row's cells otherwise get read as headers,
 * which makes every required column look "missing").
 */
function HeaderRowControl({ tabId, headerRow }: { tabId: string; headerRow: number }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [state, formAction, pending] = useActionState(setHeaderRowAction, {} as TabConfigState);
  const [value, setValue] = useState(String(headerRow));

  useEffect(() => {
    if (state.success) startTransition(() => router.refresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="tabId" value={tabId} />
      <input
        name="headerRow"
        type="number"
        min={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-14 rounded-md border border-slate-300 px-1 py-0.5 text-xs"
      />
      <button type="submit" disabled={pending} className="rounded-md border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50 disabled:opacity-50">
        {pending ? "..." : "Save"}
      </button>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
