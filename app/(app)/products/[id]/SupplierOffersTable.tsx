"use client";

import { DataTable, type ColumnDef } from "../../../../components/DataTable";
import { StatusBadge } from "../../../../components/StatusBadge";
import { formatMoney, formatNumber, formatPct } from "../../../../lib/format";

export interface OfferRow {
  supplierId: string;
  supplierName: string;
  price: number;
  stockQty: number | null;
  moq: number | null;
  leadTimeDays: number | null;
  profit: number;
  roiPct: number;
  marginPct: number;
  isProfitable: boolean;
  meetsQtyNeeded: boolean;
  meetsMoq: boolean;
  disqualifiedReasons: string[];
}

/** Supplier comparison table (spec section 19): cheapest is shown, not auto-recommended. */
export function SupplierOffersTable({ offers, bestSupplierId }: { offers: OfferRow[]; bestSupplierId?: string | null }) {
  const columns: ColumnDef<OfferRow>[] = [
    {
      key: "supplier",
      header: "Supplier",
      render: (r) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-800">{r.supplierName}</span>
          {r.supplierId === bestSupplierId && <StatusBadge status="MATCHED_ALREADY_SELLING" label="Recommended" />}
        </div>
      ),
      sortValue: (r) => r.supplierName,
    },
    { key: "price", header: "Price", render: (r) => formatMoney(r.price), sortValue: (r) => r.price, align: "right" },
    { key: "stock", header: "Supplier Stock", render: (r) => (r.stockQty == null ? "—" : formatNumber(r.stockQty)), sortValue: (r) => r.stockQty, align: "right" },
    { key: "moq", header: "MOQ", render: (r) => (r.moq == null ? "—" : formatNumber(r.moq)), sortValue: (r) => r.moq, align: "right" },
    { key: "lead", header: "Lead Time (days)", render: (r) => (r.leadTimeDays == null ? "—" : formatNumber(r.leadTimeDays)), sortValue: (r) => r.leadTimeDays, align: "right" },
    { key: "profit", header: "Profit/Unit", render: (r) => formatMoney(r.profit), sortValue: (r) => r.profit, align: "right" },
    { key: "roi", header: "ROI", render: (r) => formatPct(r.roiPct), sortValue: (r) => r.roiPct, align: "right" },
    {
      key: "status",
      header: "Eligibility",
      render: (r) =>
        r.disqualifiedReasons.length === 0 ? (
          <StatusBadge status="SUPPLIER_AVAILABLE" label="Qualifies" />
        ) : (
          <span className="flex flex-wrap gap-1">
            {r.disqualifiedReasons.map((reason) => (
              <StatusBadge key={reason} status="SUPPLIER_NOT_FOUND" label={reason.replace(/_/g, " ")} />
            ))}
          </span>
        ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={offers}
      rowKey={(r) => r.supplierId}
      emptyMessage="No supplier has priced this product yet."
    />
  );
}
