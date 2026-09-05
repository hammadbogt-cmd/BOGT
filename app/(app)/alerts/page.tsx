import Link from "next/link";
import { getAlerts } from "../../../lib/queries/alerts";
import { toPlain } from "../../../lib/serialize";
import { titleCase } from "../../../lib/format";
import { AlertsTable } from "./AlertsTable";
import { RescanButton } from "./RescanButton";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS: { key: string | undefined; label: string }[] = [
  { key: undefined, label: "All" },
  { key: "OPEN", label: "Open" },
  { key: "ACKNOWLEDGED", label: "Acknowledged" },
  { key: "RESOLVED", label: "Resolved" },
];

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const status = one(sp.status) ?? "OPEN";
  const severity = one(sp.severity) || undefined;
  const type = one(sp.type) || undefined;

  const result = await getAlerts({ status: status || undefined, severity, type });

  const buildHref = (params: Record<string, string | undefined>) => {
    const usp = new URLSearchParams();
    const merged = { status, severity, type, ...params };
    for (const [k, v] of Object.entries(merged)) if (v) usp.set(k, v);
    const qs = usp.toString();
    return qs ? `/alerts?${qs}` : "/alerts";
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Alerts</h1>
          <p className="text-sm text-slate-500">Every proactive alert the system has raised — stock, pricing, profitability, and data-quality issues, all in one place.</p>
        </div>
        <RescanButton />
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <div className="text-xs uppercase tracking-wide text-red-500">Critical</div>
          <div className="text-lg font-semibold text-red-700">{result.counts.critical}</div>
        </div>
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
          <div className="text-xs uppercase tracking-wide text-yellow-600">Warning</div>
          <div className="text-lg font-semibold text-yellow-700">{result.counts.warning}</div>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
          <div className="text-xs uppercase tracking-wide text-blue-500">Info</div>
          <div className="text-lg font-semibold text-blue-700">{result.counts.info}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_OPTIONS.map((opt) => {
          const active = (status ?? "") === (opt.key ?? "");
          return (
            <Link
              key={opt.label}
              href={buildHref({ status: opt.key })}
              className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
                active ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50"
              }`}
            >
              {opt.label}
            </Link>
          );
        })}
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3">
        {status && <input type="hidden" name="status" value={status} />}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Severity</label>
          <select name="severity" defaultValue={severity ?? ""} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">All severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="WARNING">Warning</option>
            <option value="INFO">Info</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Type</label>
          <select name="type" defaultValue={type ?? ""} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">All types</option>
            {result.typeOptions.map((t) => (
              <option key={t} value={t}>
                {titleCase(t)}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800">
          Apply Filters
        </button>
        {(severity || type) && (
          <Link href={buildHref({ severity: undefined, type: undefined })} className="text-sm text-slate-500 underline">
            Clear
          </Link>
        )}
      </form>

      <AlertsTable rows={toPlain(result.rows)} />
    </div>
  );
}
