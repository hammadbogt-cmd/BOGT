import Link from "next/link";
import { getReorderCenterRows, type ReorderCenterFilters } from "../../../lib/queries/reorder-center";
import { toPlain } from "../../../lib/serialize";
import { ReorderCenterTable } from "./ReorderCenterTable";

export const dynamic = "force-dynamic";

const PRIORITY_OPTIONS: { key: ReorderCenterFilters["priority"]; label: string }[] = [
  { key: undefined, label: "All Priorities" },
  { key: "CRITICAL", label: "Critical" },
  { key: "HIGH", label: "High" },
  { key: "MEDIUM", label: "Medium" },
  { key: "LOW", label: "Low" },
];

export default async function ReorderCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const priorityRaw = Array.isArray(sp.priority) ? sp.priority[0] : sp.priority;
  const includeAll = (Array.isArray(sp.all) ? sp.all[0] : sp.all) === "1";
  const priority = priorityRaw as ReorderCenterFilters["priority"];

  const rows = await getReorderCenterRows({ priority, includeNoReorder: includeAll });

  const buildHref = (p: ReorderCenterFilters["priority"], all: boolean) => {
    const params = new URLSearchParams();
    if (p) params.set("priority", p);
    if (all) params.set("all", "1");
    const qs = params.toString();
    return qs ? `/reorder-center?${qs}` : "/reorder-center";
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Reorder Center</h1>
        <p className="text-sm text-slate-500">
          Every product&apos;s current 30- and 60-day recommendation, transparently computed — select rows and add them to the
          Quick Reorder List in bulk.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PRIORITY_OPTIONS.map((opt) => {
          const active = (priority ?? "") === (opt.key ?? "");
          return (
            <Link
              key={opt.label}
              href={buildHref(opt.key, includeAll)}
              className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
                active ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50"
              }`}
            >
              {opt.label}
            </Link>
          );
        })}
        <span className="mx-1 h-4 w-px bg-slate-200" />
        <Link
          href={buildHref(priority, !includeAll)}
          className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
            includeAll ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50"
          }`}
        >
          {includeAll ? "Showing all products" : "Show all (incl. no reorder needed)"}
        </Link>
      </div>

      <ReorderCenterTable rows={toPlain(rows)} />
    </div>
  );
}
