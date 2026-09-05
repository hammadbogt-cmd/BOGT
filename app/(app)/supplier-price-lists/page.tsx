import { prisma } from "../../../lib/prisma";
import { getRecentImportJobs } from "../../../lib/queries/import-jobs";
import { toPlain } from "../../../lib/serialize";
import { formatDateTime } from "../../../lib/format";
import { StatusBadge } from "../../../components/StatusBadge";
import { UploadPriceListForm } from "./UploadPriceListForm";

export const dynamic = "force-dynamic";

export default async function SupplierPriceListsPage() {
  const [suppliers, jobs] = await Promise.all([
    prisma.supplier.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getRecentImportJobs("Supplier Price List"),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Supplier Price Lists</h1>
        <p className="text-sm text-slate-500">Upload a supplier&apos;s price list to update their offers across the catalog.</p>
      </div>

      <UploadPriceListForm suppliers={toPlain(suppliers)} />

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Recent Uploads</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">When</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Source</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Rows</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Price Changes</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Unmatched</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Errors</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                    No price lists uploaded yet.
                  </td>
                </tr>
              )}
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(j.startedAt)}</td>
                  <td className="px-3 py-2 max-w-xs truncate">{j.sourceName}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={j.status} />
                  </td>
                  <td className="px-3 py-2 text-right">{j.rowsRead}</td>
                  <td className="px-3 py-2 text-right">{j.priceChanges}</td>
                  <td className="px-3 py-2 text-right">{j.unmatchedProducts}</td>
                  <td className="px-3 py-2 text-right">{j.errorCount}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-500">{j.triggeredBy?.name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
