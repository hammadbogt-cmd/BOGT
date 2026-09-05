import { getProductsList, FILTER_LABELS, type ProductFilter } from "../../../lib/queries/products";
import { toPlain } from "../../../lib/serialize";
import { ProductsTable } from "./ProductsTable";

export const dynamic = "force-dynamic";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const filter = (Array.isArray(sp.filter) ? sp.filter[0] : sp.filter) as ProductFilter;
  const products = await getProductsList(filter);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">{filter ? FILTER_LABELS[filter] ?? "Products" : "Products"}</h1>
        <p className="text-sm text-slate-500">Central Product Master — every catalog source in one place.</p>
      </div>
      <ProductsTable products={toPlain(products)} />
    </div>
  );
}
