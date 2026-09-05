import Link from "next/link";
import { getMatchingQueue } from "../../../lib/queries/matching-queue";
import { toPlain } from "../../../lib/serialize";
import { MatchingQueueTable } from "./MatchingQueueTable";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS: { key: string | undefined; label: string }[] = [
  { key: "PENDING", label: "Pending" },
  { key: "CONFIRMED", label: "Confirmed" },
  { key: "REJECTED", label: "Rejected" },
  { key: undefined, label: "All" },
];

export default async function MatchingReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const statusRaw = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const status = statusRaw ?? "PENDING";

  const rows = await getMatchingQueue(status || undefined);

  const buildHref = (s: string | undefined) => (s ? `/matching-review?status=${s}` : "/matching-review");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Matching Review</h1>
        <p className="text-sm text-slate-500">
          Rows from imports and uploads that couldn&apos;t be matched to a product by barcode, ASIN, or SKU alone. Link each
          one to the right product (or reject it) — nothing is ever merged on a title guess.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_OPTIONS.map((opt) => {
          const active = status === (opt.key ?? "");
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

      <MatchingQueueTable rows={toPlain(rows)} />
    </div>
  );
}
