import Link from "next/link";
import { getAmazonInventory, STOCK_STATUS_LABELS, type StockStatusFilter } from "../../../../lib/queries/inventory";
import { toPlain } from "../../../../lib/serialize";
import { AmazonInventoryTable } from "./AmazonInventoryTable";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS: { key: StockStatusFilter; label: string }[] = [
  { key: undefined, label: "All" },
  { key: "OOS", label: STOCK_STATUS_LABELS.OOS },
  { key: "CRITICAL", label: STOCK_STATUS_LABELS.CRITICAL },
  { key: "NEAR_OOS", label: STOCK_STATUS_LABELS.NEAR_OOS },
  { key: "LOW_STOCK", label: STOCK_STATUS_LABELS.LOW_STOCK },
  { key: "HEALTHY", label: STOCK_STATUS_LABELS.HEALTHY },
];

export default async function AmazonInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const statusRaw = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const status = statusRaw as StockStatusFilter;
  const rows = await getAmazonInventory(status);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Amazon Inventory</h1>
        <p className="text-sm text-slate-500">Live Amazon-side stock position for every active product.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((opt) => {
          const active = (status ?? "") === (opt.key ?? "");
          const href = opt.key ? `/inventory/amazon?status=${opt.key}` : "/inventory/amazon";
          return (
            <Link
              key={opt.label}
              href={href}
              className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
                active ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50"
              }`}
            >
              {opt.label}
            </Link>
          );
        })}
      </div>

      <AmazonInventoryTable rows={toPlain(rows)} />
    </div>
  );
}
