import { redirect } from "next/navigation";
import { getListingStatusSummary, type CatalogSummary, type StatusTotals } from "../../../lib/reports/listing-status-summary";
import { getCurrentUser } from "../../../lib/auth/current-user";

export const dynamic = "force-dynamic";

/**
 * Replaces the workbook's "Total Listng Status" tab. The same four figures —
 * Total SKU, Total SKU QTY, Total Value and last-30-days unit sales — broken
 * down by listing status, for all products and for the USA (OA) catalog,
 * calculated here from the synced product rows rather than imported.
 */
export default async function ListingStatusPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const summary = await getListingStatusSummary();
  const hasData = summary.combined.totalSku > 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Listing Status</h1>
        <p className="text-sm text-slate-500">
          Calculated from the latest synced Amazon data — this replaces the &ldquo;Total Listng Status&rdquo; sheet tab, so the numbers can never
          go stale against the product rows they describe.
        </p>
      </div>

      {!hasData ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
          No Amazon product data yet. Run a sync from <span className="font-medium text-slate-700">Import &amp; Sync</span>, then come back —
          these totals are built from the &ldquo;All PRODUCTS STATS&rdquo; and &ldquo;OA USA Products&rdquo; tabs.
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <SummaryCard summary={summary.all} accent="bg-slate-900" />
            <SummaryCard summary={summary.usa} accent="bg-sky-700" />
            <SummaryCard summary={summary.combined} accent="bg-emerald-700" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <StatusTable summary={summary.all} />
            <StatusTable summary={summary.usa} />
          </div>

          {summary.unrecognisedStatuses.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <span className="font-semibold">Grouped under &ldquo;Other&rdquo;:</span> {summary.unrecognisedStatuses.join(", ")}. These
              statuses in the sheet don&rsquo;t match a known bucket — usually a typo or a new status worth adding.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({ summary, accent }: { summary: CatalogSummary; accent: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className={`${accent} px-4 py-2 text-sm font-semibold text-white`}>Total {summary.label} Status</div>
      <div className="grid grid-cols-2 gap-px bg-slate-200 sm:grid-cols-4">
        <Figure label="Total SKU" value={summary.totalSku} />
        <Figure label="Total SKU QTY" value={summary.totalSkuQty} />
        <Figure label="Total Value" value={summary.totalValue} money />
        <Figure label="Last 30 Days Units" value={summary.last30DaysUnitSales} />
      </div>
    </div>
  );
}

function Figure({ label, value, money = false }: { label: string; value: number; money?: boolean }) {
  return (
    <div className="bg-white px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-slate-900">{money ? formatMoney(value) : value.toLocaleString()}</div>
    </div>
  );
}

function StatusTable({ summary }: { summary: CatalogSummary }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">{summary.label} by listing status</div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-500">Status</th>
              <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide text-slate-500">Total SKU</th>
              <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide text-slate-500">SKU QTY</th>
              <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide text-slate-500">Value</th>
              <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide text-slate-500">30d Units</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {summary.byStatus.map((row) => (
              <tr key={row.status} className={row.totalSku === 0 ? "text-slate-400" : "text-slate-700"}>
                <td className="px-3 py-1.5">
                  <span className={`inline-block rounded px-1.5 py-0.5 ${statusTint(row.status)}`}>{row.status}</span>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{row.totalSku.toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{row.totalSkuQty.toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatMoney(row.totalValue)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{row.last30DaysUnitSales.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-800">
            <tr>
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right tabular-nums">{summary.totalSku.toLocaleString()}</td>
              <td className="px-3 py-2 text-right tabular-nums">{summary.totalSkuQty.toLocaleString()}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatMoney(summary.totalValue)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{summary.last30DaysUnitSales.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function statusTint(status: StatusTotals["status"]): string {
  if (status.startsWith("Buybox Win")) return "bg-emerald-100 text-emerald-800";
  if (status === "Selling at Loss") return "bg-red-100 text-red-800";
  if (status === "Out of Stock") return "bg-slate-200 text-slate-700";
  if (status === "No Buybox Our Price Is High") return "bg-rose-100 text-rose-800";
  if (status.startsWith("Price Update")) return "bg-amber-100 text-amber-800";
  if (status === "BSR High Buybox WIN No Sale") return "bg-lime-100 text-lime-800";
  if (status === "Inbound") return "bg-blue-100 text-blue-800";
  if (status === "Reserved") return "bg-purple-100 text-purple-800";
  if (status === "Unfulfillable") return "bg-orange-100 text-orange-800";
  return "bg-slate-100 text-slate-600";
}

function formatMoney(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
