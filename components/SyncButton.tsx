"use client";

import { useActionState } from "react";
import { syncAllAction, type SyncActionState } from "../app/actions/sync-actions";

const initialState: SyncActionState = {};

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
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
      {state.results && (
        <span className="text-xs text-slate-500">
          {state.results.every((r) => r.status === "CONNECTION_REQUIRED")
            ? "Connection required — see Import & Sync"
            : `Last run: ${state.results.map((r) => r.status).join(", ")}`}
        </span>
      )}
    </div>
  );
}
