"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DataTable, type ColumnDef } from "../../../components/DataTable";
import { StatusBadge } from "../../../components/StatusBadge";
import { formatDateTime, titleCase } from "../../../lib/format";
import { confirmMatchAction, rejectMatchAction, searchProductsAction } from "../../actions/matching-queue-actions";
import type { MatchingQueueRow } from "../../../lib/queries/matching-queue";
import type { ProductSearchResult } from "../../../lib/queries/matching-queue";

function MatchRowActions({ row }: { row: MatchingQueueRow }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [selected, setSelected] = useState<ProductSearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  async function handleSearch(q: string) {
    setQuery(q);
    setSelected(null);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const found = await searchProductsAction(q);
    setResults(found);
    setSearching(false);
  }

  async function handleConfirm() {
    if (!selected) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("entryId", row.id);
    fd.set("productId", selected.id);
    const result = await confirmMatchAction({}, fd);
    setBusy(false);
    setMessage(result.error ?? result.note ?? "Confirmed.");
    if (result.success) startTransition(() => router.refresh());
  }

  async function handleReject() {
    setBusy(true);
    const fd = new FormData();
    fd.set("entryId", row.id);
    const result = await rejectMatchAction({}, fd);
    setBusy(false);
    setMessage(result.error ?? "Rejected.");
    if (result.success) startTransition(() => router.refresh());
  }

  if (row.status !== "PENDING") {
    return <span className="text-xs text-slate-400">{message ?? "—"}</span>;
  }

  return (
    <div className="flex min-w-[220px] flex-col gap-1">
      <div className="relative">
        <input
          value={selected ? selected.title : query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search product to link..."
          className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
        />
        {query.length >= 2 && !selected && (
          <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
            {searching && <div className="px-2 py-1 text-xs text-slate-400">Searching...</div>}
            {!searching && results.length === 0 && <div className="px-2 py-1 text-xs text-slate-400">No matches.</div>}
            {results.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setSelected(p);
                  setResults([]);
                }}
                className="block w-full truncate px-2 py-1 text-left text-xs hover:bg-slate-50"
              >
                {p.title} <span className="text-slate-400">{p.primaryBarcode ?? p.asin ?? ""}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!selected || busy}
          onClick={handleConfirm}
          className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {busy ? "..." : "Confirm Link"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={handleReject}
          className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
      {message && <span className="text-[11px] text-slate-500">{message}</span>}
    </div>
  );
}

export function MatchingQueueTable({ rows }: { rows: MatchingQueueRow[] }) {
  const columns: ColumnDef<MatchingQueueRow>[] = [
    { key: "type", header: "Source", render: (r) => titleCase(r.candidateType), sortValue: (r) => r.candidateType },
    { key: "identifier", header: "Identifier", render: (r) => r.rawIdentifier ?? "—" },
    { key: "title", header: "Raw Title", render: (r) => <div className="max-w-[200px] truncate">{r.rawTitle ?? "—"}</div> },
    { key: "brand", header: "Brand", render: (r) => r.rawBrand ?? "—" },
    { key: "confidence", header: "Confidence", render: (r) => <StatusBadge status={r.confidence} label={r.confidence} /> },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} label={r.status} /> },
    { key: "created", header: "Raised", render: (r) => formatDateTime(r.createdAt), sortValue: (r) => r.createdAt },
    {
      key: "linked",
      header: "Linked Product",
      render: (r) => (r.status === "CONFIRMED" && r.reviewedByName ? <span className="text-xs text-slate-500">by {r.reviewedByName}</span> : "—"),
    },
    { key: "actions", header: "Actions", render: (r) => <MatchRowActions row={r} /> },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      searchPlaceholder="Search identifier, title, brand..."
      searchFields={(r) => `${r.rawIdentifier ?? ""} ${r.rawTitle ?? ""} ${r.rawBrand ?? ""}`}
      emptyMessage="Nothing in the Matching Review queue."
    />
  );
}
