import Link from "next/link";
import { prisma } from "../../../lib/prisma";
import { getSupplierComparisonRows } from "../../../lib/queries/supplier-comparison";
import { toPlain } from "../../../lib/serialize";
import { SupplierComparisonTable } from "./SupplierComparisonTable";

export const dynamic = "force-dynamic";

export default async function SupplierComparisonPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const supplierId = Array.isArray(sp.supplier) ? sp.supplier[0] : sp.supplier;
  const onlyMultiSupplier = (Array.isArray(sp.multi) ? sp.multi[0] : sp.multi) === "1";

  const [rows, suppliers] = await Promise.all([
    getSupplierComparisonRows({ supplierId, onlyMultiSupplier }),
    prisma.supplier.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const buildHref = (nextSupplier: string | undefined, nextMulti: boolean) => {
    const params = new URLSearchParams();
    if (nextSupplier) params.set("supplier", nextSupplier);
    if (nextMulti) params.set("multi", "1");
    const qs = params.toString();
    return qs ? `/supplier-comparison?${qs}` : "/supplier-comparison";
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Supplier Comparison</h1>
        <p className="text-sm text-slate-500">
          Every supplier&apos;s price for the same product, side by side. The cheapest offer is marked, but it is not always the
          recommended one — stock, MOQ, lead time, and profitability all factor in.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={buildHref(undefined, onlyMultiSupplier)}
          className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
            !supplierId ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50"
          }`}
        >
          All Suppliers
        </Link>
        {suppliers.map((s) => (
          <Link
            key={s.id}
            href={buildHref(s.id, onlyMultiSupplier)}
            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
              supplierId === s.id ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50"
            }`}
          >
            {s.name}
          </Link>
        ))}
        <span className="mx-1 h-4 w-px bg-slate-200" />
        <Link
          href={buildHref(supplierId, !onlyMultiSupplier)}
          className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
            onlyMultiSupplier ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50"
          }`}
        >
          {onlyMultiSupplier ? "Showing multi-supplier only" : "Only products with 2+ suppliers"}
        </Link>
      </div>

      <SupplierComparisonTable rows={toPlain(rows)} />
    </div>
  );
}
