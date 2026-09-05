"use client";

import { toCsv, downloadCsv } from "../../../lib/csv-export";

export function ExportCsvButton<T>({
  rows,
  columns,
  filename,
}: {
  rows: T[];
  columns: { header: string; value: (row: T) => string | number | null | undefined }[];
  filename: string;
}) {
  return (
    <button
      type="button"
      onClick={() => downloadCsv(filename, toCsv(rows, columns))}
      className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
    >
      Export CSV
    </button>
  );
}
