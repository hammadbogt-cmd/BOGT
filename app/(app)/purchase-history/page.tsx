import Link from "next/link";
import { getPurchaseHistory } from "../../../lib/queries/purchase-history";
import { toPlain } from "../../../lib/serialize";
import { formatMoney, formatNumber } from "../../../lib/format";
import { PurchaseHistoryTable } from "./PurchaseHistoryTable";

export const dynamic = "force-dynamic";

export default async function PurchaseHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const supplierId = one(sp.supplierId) || undefined;
  const dateFrom = one(sp.dateFrom) || undefined;
  const dateTo = one(sp.dateTo) || undefined;

  const result = await getPurchaseHistory({ supplierId, dateFrom, dateTo });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Purchase History</h1>
        <p className="text-sm text-slate-500">
          Every receiving event across all products — Stock_IN imports and Purchase Order receipts alike — in one
          chronological, filterable ledger.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs uppercase tracking-wide text-slate-400">Total Spend (filtered)</div>
          <div className="text-lg font-semibold text-slate-900">{formatMoney(result.totalSpend)}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs uppercase tracking-wide text-slate-400">Units Received</div>
          <div className="text-lg font-semibold text-slate-900">{formatNumber(result.totalUnits)}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs uppercase tracking-wide text-slate-400">Transactions</div>
          <div className="text-lg font-semibold text-slate-900">{formatNumber(result.transactionCount)}</div>
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3" method="get">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Supplier</label>
          <select name="supplierId" defaultValue={supplierId ?? ""} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">All suppliers</option>
            {result.supplierOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">From</label>
          <input type="date" name="dateFrom" defaultValue={dateFrom ?? ""} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">To</label>
          <input type="date" name="dateTo" defaultValue={dateTo ?? ""} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <button type="submit" className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800">
          Apply Filters
        </button>
        {(supplierId || dateFrom || dateTo) && (
          <Link href="/purchase-history" className="text-sm text-slate-500 underline">
            Clear
          </Link>
        )}
      </form>

      <PurchaseHistoryTable rows={toPlain(result.rows)} />
    </div>
  );
}
