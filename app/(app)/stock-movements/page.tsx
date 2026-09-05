import Link from "next/link";
import { getStockMovements } from "../../../lib/queries/stock-movements";
import { toPlain } from "../../../lib/serialize";
import { formatNumber } from "../../../lib/format";
import { StockMovementsTable } from "./StockMovementsTable";

export const dynamic = "force-dynamic";

const SOURCE_TYPES = ["STOCK_IN", "STOCK_OUT", "PO_RECEIPT", "ADJUSTMENT", "OPENING_BALANCE"];

export default async function StockMovementsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const direction = (one(sp.direction) as "IN" | "OUT" | undefined) || undefined;
  const sourceType = one(sp.sourceType) || undefined;
  const locationId = one(sp.locationId) || undefined;
  const dateFrom = one(sp.dateFrom) || undefined;
  const dateTo = one(sp.dateTo) || undefined;

  const result = await getStockMovements({ direction, sourceType, locationId, dateFrom, dateTo });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Stock Movements</h1>
        <p className="text-sm text-slate-500">
          Every physical stock event across every location — Stock_IN, Stock_OUT, and Purchase Order receipts — in one
          chronological, filterable feed.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs uppercase tracking-wide text-slate-400">Units In (filtered)</div>
          <div className="text-lg font-semibold text-green-700">+{formatNumber(result.totalIn)}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs uppercase tracking-wide text-slate-400">Units Out (filtered)</div>
          <div className="text-lg font-semibold text-red-600">-{formatNumber(result.totalOut)}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs uppercase tracking-wide text-slate-400">Transactions</div>
          <div className="text-lg font-semibold text-slate-900">{formatNumber(result.transactionCount)}</div>
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3" method="get">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Direction</label>
          <select name="direction" defaultValue={direction ?? ""} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">All</option>
            <option value="IN">In</option>
            <option value="OUT">Out</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Source</label>
          <select name="sourceType" defaultValue={sourceType ?? ""} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">All sources</option>
            {SOURCE_TYPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Location</label>
          <select name="locationId" defaultValue={locationId ?? ""} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">All locations</option>
            {result.locationOptions.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
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
        {(direction || sourceType || locationId || dateFrom || dateTo) && (
          <Link href="/stock-movements" className="text-sm text-slate-500 underline">
            Clear
          </Link>
        )}
      </form>

      <StockMovementsTable rows={toPlain(result.rows)} />
    </div>
  );
}
