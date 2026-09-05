/** Builds a CSV string from rows + column accessors, quoting values that need it. */
export function toCsv<T>(rows: T[], columns: { header: string; value: (row: T) => string | number | null | undefined }[]): string {
  const escape = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const headerLine = columns.map((c) => escape(c.header)).join(",");
  const lines = rows.map((row) => columns.map((c) => escape(c.value(row))).join(","));
  return [headerLine, ...lines].join("\n");
}

/** Triggers a browser download of a CSV string — this is a normal server-rendered page, not a sandboxed preview, so a plain Blob + anchor click works. */
export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
