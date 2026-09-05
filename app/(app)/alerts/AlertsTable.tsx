"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DataTable, type ColumnDef } from "../../../components/DataTable";
import { StatusBadge } from "../../../components/StatusBadge";
import { formatDateTime, titleCase } from "../../../lib/format";
import { acknowledgeAlertAction, resolveAlertAction } from "../../actions/alert-actions";
import type { AlertRow } from "../../../lib/queries/alerts";

export function AlertsTable({ rows }: { rows: AlertRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function handleAck(alert: AlertRow) {
    setBusyId(alert.id);
    const fd = new FormData();
    fd.set("alertId", alert.id);
    await acknowledgeAlertAction({}, fd);
    setBusyId(null);
    startTransition(() => router.refresh());
  }

  async function handleResolve(alert: AlertRow) {
    setBusyId(alert.id);
    const fd = new FormData();
    fd.set("alertId", alert.id);
    await resolveAlertAction({}, fd);
    setBusyId(null);
    startTransition(() => router.refresh());
  }

  const columns: ColumnDef<AlertRow>[] = [
    { key: "severity", header: "Severity", render: (r) => <StatusBadge status={r.severity} label={r.severity} /> },
    { key: "type", header: "Type", render: (r) => titleCase(r.type), sortValue: (r) => r.type },
    {
      key: "product",
      header: "Product",
      render: (r) => (r.productId ? <Link href={`/products/${r.productId}`} className="text-blue-700 hover:underline">{r.productTitle}</Link> : <span className="text-slate-400">System</span>),
      sortValue: (r) => r.productTitle ?? "",
    },
    { key: "message", header: "Message", render: (r) => <span className="block max-w-md">{r.message}</span> },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} label={r.status} /> },
    { key: "created", header: "Raised", render: (r) => formatDateTime(r.createdAt), sortValue: (r) => r.createdAt },
    {
      key: "actions",
      header: "Actions",
      render: (r) => (
        <div className="flex gap-2">
          {r.status === "OPEN" && (
            <button
              type="button"
              disabled={busyId === r.id}
              onClick={() => handleAck(r)}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Acknowledge
            </button>
          )}
          {r.status !== "RESOLVED" && (
            <button
              type="button"
              disabled={busyId === r.id}
              onClick={() => handleResolve(r)}
              className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Resolve
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      searchPlaceholder="Search message or product..."
      searchFields={(r) => `${r.message} ${r.productTitle ?? ""} ${r.type}`}
      emptyMessage="No alerts match these filters."
    />
  );
}
