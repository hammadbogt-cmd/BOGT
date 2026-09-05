import Link from "next/link";
import { globalSearch } from "../../../lib/queries/search";
import { StatusBadge } from "../../../components/StatusBadge";
import { formatDateTime, titleCase } from "../../../lib/format";

export const dynamic = "force-dynamic";

function ResultSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">
        {title} <span className="font-normal text-slate-400">({count})</span>
      </h2>
      {children}
    </div>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const q = raw ?? "";
  const results = q ? await globalSearch(q) : null;

  const totalResults = results
    ? results.products.length + results.suppliers.length + results.purchaseOrders.length + results.invoices.length + results.stockMovements.length
    : 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Search Results</h1>
        <p className="text-sm text-slate-500">
          {q ? (
            <>
              Showing matches for <span className="font-mono text-slate-700">&ldquo;{q}&rdquo;</span> across products, suppliers,
              purchase orders, invoices, and stock movements.
            </>
          ) : (
            "Type a barcode, ASIN, SKU, title, brand, supplier name, invoice #, PO #, or shipment reference in the search box above."
          )}
        </p>
      </div>

      {q && totalResults === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
          No matches found for &ldquo;{q}&rdquo;. Try a shorter or partial value — search matches on contains, not exact.
        </div>
      )}

      {results && (
        <div className="flex flex-col gap-4">
          <ResultSection title="Products" count={results.products.length}>
            <ul className="divide-y divide-slate-100">
              {results.products.map((p) => (
                <li key={p.id}>
                  <Link href={`/products/${p.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 hover:bg-slate-50">
                    <div>
                      <div className="text-sm font-medium text-slate-800">{p.title}</div>
                      <div className="text-xs text-slate-400">
                        {p.brand ?? "No brand"} · Barcode {p.primaryBarcode ?? "—"} · ASIN {p.asin ?? "—"} · SKU {p.amazonSku ?? p.oaSku ?? "—"}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <StatusBadge status={p.profitStatus} />
                      <StatusBadge status={p.reorderStatus} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </ResultSection>

          <ResultSection title="Suppliers" count={results.suppliers.length}>
            <ul className="divide-y divide-slate-100">
              {results.suppliers.map((s) => (
                <li key={s.id} className="py-2 text-sm">
                  <span className="font-medium text-slate-800">{s.name}</span>
                  {s.contactName && <span className="text-slate-400"> — {s.contactName}</span>}
                </li>
              ))}
            </ul>
          </ResultSection>

          <ResultSection title="Purchase Orders" count={results.purchaseOrders.length}>
            <ul className="divide-y divide-slate-100">
              {results.purchaseOrders.map((po) => (
                <li key={po.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    <span className="font-mono font-medium text-slate-800">{po.poNumber}</span>
                    <span className="text-slate-400"> — {po.supplierName}</span>
                  </span>
                  <StatusBadge status={po.status} />
                </li>
              ))}
            </ul>
          </ResultSection>

          <ResultSection title="Invoices" count={results.invoices.length}>
            <ul className="divide-y divide-slate-100">
              {results.invoices.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    <span className="font-mono font-medium text-slate-800">{inv.invoiceNumber}</span>
                    <span className="text-slate-400"> — {inv.supplierName ?? "Unknown supplier"}</span>
                  </span>
                  <StatusBadge status={inv.status} />
                </li>
              ))}
            </ul>
          </ResultSection>

          <ResultSection title="Stock Movements" count={results.stockMovements.length}>
            <ul className="divide-y divide-slate-100">
              {results.stockMovements.map((m) => (
                <li key={m.id}>
                  <Link href={`/products/${m.productId}`} className="flex flex-wrap items-center justify-between gap-2 py-2 hover:bg-slate-50">
                    <div>
                      <div className="text-sm font-medium text-slate-800">{m.productTitle}</div>
                      <div className="text-xs text-slate-400">
                        {m.invoiceId ? `Invoice ${m.invoiceId}` : m.shipmentReference ? `Shipment ${m.shipmentReference}` : "—"} ·{" "}
                        {formatDateTime(m.transactionDate)}
                      </div>
                    </div>
                    <StatusBadge status={m.direction === "IN" ? "PRICE_OK" : "PRICE_INCREASED"} label={titleCase(`${m.direction === "IN" ? "stock in" : "stock out"}`)} />
                  </Link>
                </li>
              ))}
            </ul>
          </ResultSection>
        </div>
      )}
    </div>
  );
}
