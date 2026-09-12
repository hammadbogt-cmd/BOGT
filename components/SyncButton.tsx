"use client";

import { useActionState } from "react";
import { syncAllAction, type SyncActionState } from "../app/actions/sync-actions";
import type { SyncSummary } from "../lib/sheets/sync";

const initialState: SyncActionState = {};

/** A one-line outcome, with the first real problem named rather than just a status word. */
function describeRun(results: SyncSummary[]): string {
  if (results.every((r) => r.status === "CONNECTION_REQUIRED")) return "Connection required — see Import & Sync";

  const rows = results.reduce((sum, r) => sum + r.productsChecked, 0);
  const seconds = (results.reduce((sum, r) => sum + r.durationMs, 0) / 1000).toFixed(1);
  const problems = results.flatMap((r) => r.errors);

  if (problems.length === 0) return `Synced ${rows.toLocaleString()} rows in ${seconds}s`;
  return `Synced ${rows.toLocaleString()} rows in ${seconds}s · ${problems.length} issue${problems.length === 1 ? "" : "s"} — see Import & Sync`;
}

/** The single primary "SYNC ALL LATEST DATA" button (spec section 48). */
export function SyncButton() {
  const [state, formAction, isPending] = useActionState(syncAllAction, initialState);

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={formAction}>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {isPending ? "Syncing..." : "Sync All Latest Data"}
        </button>
      </form>
      {state.error && <span className="max-w-md text-right text-xs text-red-600">{state.error}</span>}
      {state.results && <span className="max-w-md text-right text-xs text-slate-500">{describeRun(state.results)}</span>}
    </div>
  );
}
