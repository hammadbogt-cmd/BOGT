"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rescanAlertsAction, type RescanState } from "../../actions/alert-actions";

const initial: RescanState = {};

export function RescanButton() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [state, formAction, isPending] = useActionState(rescanAlertsAction, initial);

  useEffect(() => {
    if (state.success) startTransition(() => router.refresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success, state.productsScanned]);

  return (
    <form action={formAction} className="flex items-center gap-3">
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {isPending ? "Scanning..." : "Rescan All Products"}
      </button>
      {state.success && <span className="text-sm text-green-700">Scanned {state.productsScanned} products.</span>}
      {state.error && <span className="text-sm text-red-600">{state.error}</span>}
    </form>
  );
}
