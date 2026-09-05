import Link from "next/link";
import { getPurchaseOrdersList } from "../../../lib/queries/purchase-orders";
import { toPlain } from "../../../lib/serialize";
import { PurchaseOrdersTable } from "./PurchaseOrdersTable";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS: { key: string | undefined; label: string }[] = [
  { key: undefined, label: "All" },
  { key: "DRAFT", label: "Draft" },
  { key: "ORDERED", label: "Ordered" },
  { key: "PARTIALLY_RECEIVED", label: "Partially Received" },
  { key: "RECEIVED", label: "Received" },
  { key: "CANCELLED", label: "Cancelled" },
];

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const statusRaw = Array.isArray(sp.status) ? sp.status[0] : sp.status;

  const rows = await getPurchaseOrdersList(statusRaw);

  const buildHref = (s: string | undefined) => (s ? `/purchase-orders?status=${s}` : "/purchase-orders");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Purchase Orders</h1>
        <p className="text-sm text-slate-500">
          Every PO created from a Purchase Plan (one per supplier). Open a PO to mark it as sent, and to record what actually
          arrives.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_OPTIONS.map((opt) => {
          const active = (statusRaw ?? "") === (opt.key ?? "");
          return (
            <Link
              key={opt.label}
              href={buildHref(opt.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
                active ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50"
              }`}
            >
              {opt.label}
            </Link>
          );
        })}
      </div>

      <PurchaseOrdersTable rows={toPlain(rows)} />
    </div>
  );
}
