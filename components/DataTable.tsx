"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export interface ColumnDef<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number | null;
  align?: "left" | "right" | "center";
  width?: string;
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string | undefined;
  searchPlaceholder?: string;
  searchFields?: (row: T) => string;
  pageSize?: number;
  emptyMessage?: string;
}

/**
 * A general-purpose client-side table: search, sortable columns, sticky
 * header, and pagination (spec section 38). Data is fetched server-side and
 * handed in as `rows` — this component only handles presentation/interaction,
 * so it stays fast even for a few thousand rows.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  searchPlaceholder = "Search...",
  searchFields,
  pageSize = 50,
  emptyMessage = "No records found.",
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!query.trim() || !searchFields) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((r) => searchFields(r).toLowerCase().includes(q));
  }, [rows, query, searchFields]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return copy;
  }, [filtered, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-3">
      {searchFields && (
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder={searchPlaceholder}
            className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-1.5 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <span className="text-xs text-slate-500">{sorted.length.toLocaleString()} results</span>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={col.sortValue ? () => toggleSort(col.key) : undefined}
                  className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap ${
                    col.sortValue ? "cursor-pointer select-none hover:text-slate-800" : ""
                  } ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"}`}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.header}
                  {sortKey === col.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-slate-400">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {pageRows.map((row) => {
              const href = rowHref?.(row);
              const cells = columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-3 py-2 whitespace-nowrap ${
                    col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                  }`}
                >
                  {col.render(row)}
                </td>
              ));
              return href ? (
                <tr key={rowKey(row)} className="hover:bg-slate-50">
                  {columns.map((col, i) => (
                    <td
                      key={col.key}
                      className={`px-0 py-0 whitespace-nowrap ${
                        col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                      }`}
                    >
                      <Link href={href} className="block px-3 py-2">
                        {col.render(row)}
                      </Link>
                    </td>
                  ))}
                </tr>
              ) : (
                <tr key={rowKey(row)} className="hover:bg-slate-50">
                  {cells}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
