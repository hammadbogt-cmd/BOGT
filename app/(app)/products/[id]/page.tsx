import Image from "next/image";
import { notFound } from "next/navigation";
import { getProductDetail } from "../../../../lib/queries/product-detail";
import { toPlain } from "../../../../lib/serialize";
import { StatusBadge } from "../../../../components/StatusBadge";
import { formatDate, formatMoney, formatNumber, formatPct } from "../../../../lib/format";
import { AddToReorderButton } from "./AddToReorderButton";
import { SupplierOffersTable, type OfferRow } from "./SupplierOffersTable";
import { PurchaseHistoryTable, type PurchaseHistoryRow } from "./PurchaseHistoryTable";
import { StockMovementTable, type StockMovementRow } from "./StockMovementTable";
import { PurchasePriceChart } from "./PurchasePriceChart";

export const dynamic = "force-dynamic";

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value, valueClassName }: { label: string; value: React.ReactNode; valueClassName?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wide text-slate-400">{label}</span>
      <span className={`text-sm font-medium text-slate-800 ${valueClassName ?? ""}`}>{value ?? "—"}</span>
    </div>
  );
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{children}</div>;
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getProductDetail(id);
  if (!detail) notFound();

  const data = toPlain(detail);
  const { product, reorderRec, purchaseHistory, purchaseStats, mostUsedSupplier, transactions, evaluatedOffers, bestSupplier, profitAtCurrentCost } = data;

  const breakdown = reorderRec?.breakdown as
    | { formula: string; safetyStock: number; officeIncluded: boolean }
    | undefined;

  const purchasePricePoints: { date: string; cost: number }[] = purchaseHistory.map((p: PurchaseHistoryRow) => ({
    date: p.date,
    cost: Number(p.newCost),
  }));

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50">
            {product.imageUrl ? (
              <Image src={product.imageUrl} alt={product.title} width={80} height={80} className="h-full w-full object-contain" unoptimized />
            ) : (
              <span className="text-xs text-slate-300">No image</span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-slate-900">{product.title}</h1>
              <StatusBadge status={product.catalogSource === "OA_USA" ? "OA_USA" : "AMAZON"} label={product.catalogSource === "OA_USA" ? "OA USA" : "Amazon Main"} />
            </div>
            <p className="text-sm text-slate-500">{product.brand ?? "No brand"}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              <span>Barcode: <span className="font-mono text-slate-700">{product.primaryBarcode ?? "—"}</span></span>
              <span>ASIN: <span className="font-mono text-slate-700">{product.asin ?? "—"}</span></span>
              <span>SKU: <span className="font-mono text-slate-700">{product.amazonSku ?? product.oaSku ?? "—"}</span></span>
            </div>
            <div className="mt-1 flex flex-wrap gap-2">
              <StatusBadge status={product.listingStatus} />
              <StatusBadge status={product.profitStatus} />
              <StatusBadge status={reorderRec?.stockStatus ?? null} />
              <StatusBadge status={product.reorderStatus} />
            </div>
          </div>
        </div>
        <AddToReorderButton
          productId={product.id}
          recommendedQty={reorderRec?.recommendedQty30 ?? 0}
          supplierId={bestSupplier?.supplierId ?? null}
          supplierPrice={bestSupplier?.price ?? null}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Amazon Position */}
        <SectionCard title="Current Amazon Position" subtitle="Latest snapshot from Amazon stats import">
          <FieldGrid>
            <Field label="ASIN" value={product.asin} />
            <Field label="SKU" value={product.amazonSku} />
            <Field label="BSR" value={formatNumber(product.bsr)} />
            <Field label="Units Shipped T30" value={formatNumber(product.unitsShippedT30)} />
            <Field label="Amazon Stock" value={formatNumber(product.amazonAvailableQty)} />
            <Field label="Reserved" value={formatNumber(product.amazonReservedQty)} />
            <Field label="Inbound" value={formatNumber(product.amazonInboundQty)} />
            <Field label="Unfulfillable" value={formatNumber(product.amazonUnfulfillableQty)} />
            <Field label="Buy Box Price" value={formatMoney(product.buyBoxPrice)} />
            <Field label="Our Price" value={formatMoney(product.ourPrice)} />
          </FieldGrid>
        </SectionCard>

        {/* Warehouse Position */}
        <SectionCard title="Warehouse Position" subtitle="Rover + Office physical stock">
          <FieldGrid>
            <Field label="Rover Stock" value={formatNumber(product.roverQty)} />
            <Field label="Office Stock" value={formatNumber(product.officeQty)} />
            <Field label="Incoming PO" value={formatNumber(product.incomingPoQty)} />
            <Field label="Shelf Location" value={product.shelfLocation} />
            <Field label="Boxes" value={product.totalBoxes != null ? formatNumber(product.totalBoxes) : "—"} />
            <Field label="Units / Box" value={product.qtyPerBox != null ? formatNumber(product.qtyPerBox) : "—"} />
            <Field label="Loose Qty" value={product.looseQty != null ? formatNumber(product.looseQty) : "—"} />
            <Field label="Inventory Value" value={formatMoney(product.inventoryValue)} />
          </FieldGrid>
        </SectionCard>

        {/* Purchasing */}
        <SectionCard title="Purchasing" subtitle="Cost history rollup">
          <FieldGrid>
            <Field label="Current Cost" value={formatMoney(product.currentCost)} />
            <Field label="Cost With VAT" value={formatMoney(product.currentCostWithVat)} />
            <Field label="Last Purchase Cost" value={formatMoney(product.lastPurchaseCost)} />
            <Field label="Last Purchase Date" value={formatDate(product.lastPurchaseDate)} />
            <Field label="Weighted Avg Cost" value={formatMoney(product.weightedAvgCost)} />
            <Field label="Lowest Historical Cost" value={formatMoney(product.lowestHistoricalCost)} />
            <Field label="Highest Historical Cost" value={formatMoney(product.highestHistoricalCost)} />
            <Field label="First Purchase Date" value={formatDate(product.firstPurchaseDate)} />
            <Field label="# Purchases" value={formatNumber(product.purchaseCount)} />
            <Field label="Lifetime Qty Purchased" value={formatNumber(product.lifetimePurchasedQty)} />
            <Field label="Most-Used Supplier" value={mostUsedSupplier} />
          </FieldGrid>
        </SectionCard>

        {/* Sales / Reorder */}
        <SectionCard title="Sales &amp; Reorder" subtitle="BSR-tiered demand engine output">
          {reorderRec ? (
            <div className="flex flex-col gap-4">
              <FieldGrid>
                <Field label="T30 Sales" value={formatNumber(reorderRec.t30Sales)} />
                <Field label="T60 Sales" value={`${formatNumber(reorderRec.t60Sales)}${reorderRec.t60IsEstimated ? " (est.)" : ""}`} />
                <Field label="Avg Daily Sales" value={reorderRec.avgDailySales != null ? Number(reorderRec.avgDailySales).toFixed(2) : "—"} />
                <Field label="Days of Stock" value={reorderRec.daysOfStock != null ? `${Number(reorderRec.daysOfStock).toFixed(1)} days` : "No sales velocity"} />
                <Field label="30-Day Target" value={formatNumber(reorderRec.targetDemand30)} />
                <Field label="30-Day Recommend Qty" value={formatNumber(reorderRec.recommendedQty30)} valueClassName="text-base font-bold" />
                <Field label="60-Day Target" value={formatNumber(reorderRec.targetDemand60)} />
                <Field label="60-Day Recommend Qty" value={formatNumber(reorderRec.recommendedQty60)} valueClassName="text-base font-bold" />
                <Field label="Priority" value={<StatusBadge status={reorderRec.priority} />} />
                <Field label="Reorder Status" value={<StatusBadge status={reorderRec.reorderStatus} />} />
              </FieldGrid>
              {breakdown?.formula && (
                <div className="rounded-md bg-slate-50 p-3 text-xs">
                  <p className="mb-1 font-semibold uppercase tracking-wide text-slate-400">Why this number (30-day)</p>
                  <p className="font-mono text-slate-600">{breakdown.formula}</p>
                  <p className="mt-1 text-slate-400">
                    Safety stock: {formatNumber(breakdown.safetyStock)} · Office stock {breakdown.officeIncluded ? "included" : "excluded"} in availability
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No reorder recommendation has been computed for this product yet.</p>
          )}
        </SectionCard>
      </div>

      {/* Profit */}
      <SectionCard title="Profitability" subtitle="At current master cost vs. best available supplier cost">
        <FieldGrid>
          <Field label="Selling Price" value={formatMoney(product.ourPrice ?? product.buyBoxPrice)} />
          <Field label="Current Cost" value={formatMoney(product.currentCost)} />
          <Field label="Breakeven Price" value={formatMoney(product.breakevenPrice)} />
          <Field label="Profit / Unit (current cost)" value={profitAtCurrentCost ? formatMoney(profitAtCurrentCost.profit) : formatMoney(product.profitPerUnit)} />
          <Field label="ROI (current cost)" value={profitAtCurrentCost ? formatPct(profitAtCurrentCost.roiPct) : formatPct(product.roiPct)} />
          <Field label="Margin (current cost)" value={profitAtCurrentCost ? formatPct(profitAtCurrentCost.marginPct) : formatPct(product.marginPct)} />
          <Field label="FBA Fee" value={formatMoney(profitAtCurrentCost?.fbaFee ?? product.fbaFee)} />
          <Field label="Referral Fee" value={profitAtCurrentCost ? `${formatMoney(profitAtCurrentCost.referralFee)} (${formatPct(profitAtCurrentCost.referralFeePct * 100)})` : formatMoney(product.referralFee)} />
          <Field label="Profit Status" value={<StatusBadge status={product.profitStatus} />} />
          {bestSupplier && (
            <>
              <Field label="Best Supplier Cost" value={formatMoney(bestSupplier.price)} />
              <Field label="Profit / Unit (best supplier)" value={formatMoney(bestSupplier.profit)} />
              <Field label="ROI (best supplier)" value={formatPct(bestSupplier.roiPct)} />
            </>
          )}
        </FieldGrid>
      </SectionCard>

      {/* Supplier Offers */}
      <SectionCard title="Supplier Offers" subtitle="Every active supplier price for this product — cheapest is not automatically recommended">
        <SupplierOffersTable offers={evaluatedOffers as OfferRow[]} bestSupplierId={bestSupplier?.supplierId ?? null} />
      </SectionCard>

      {/* Purchase History */}
      <SectionCard title="Purchase History" subtitle="Every recorded purchase, most recent first">
        {purchaseStats && (
          <div className="mb-4 grid grid-cols-2 gap-4 rounded-md bg-slate-50 p-3 sm:grid-cols-3 lg:grid-cols-6">
            <Field label="# Purchases" value={formatNumber(purchaseStats.count)} />
            <Field label="Total Units" value={formatNumber(purchaseStats.totalUnits)} />
            <Field label="Lowest Cost" value={formatMoney(purchaseStats.lowestCost)} />
            <Field label="Highest Cost" value={formatMoney(purchaseStats.highestCost)} />
            <Field label="Average Cost" value={formatMoney(purchaseStats.averageCost)} />
            <Field label="First → Last" value={`${formatDate(purchaseStats.firstPurchase)} → ${formatDate(purchaseStats.lastPurchase)}`} />
          </div>
        )}
        {purchasePricePoints.length > 1 && (
          <div className="mb-4">
            <PurchasePriceChart points={purchasePricePoints} />
          </div>
        )}
        <PurchaseHistoryTable rows={purchaseHistory as PurchaseHistoryRow[]} />
      </SectionCard>

      {/* Stock Movement History */}
      <SectionCard
        title="Stock Movement History"
        subtitle="Combined Stock IN / Stock OUT, most recent 100 movements. Running totals are net units moved within this history, not a live physical balance — see the position cards above for current stock."
      >

        <StockMovementTable rows={transactions as StockMovementRow[]} />
      </SectionCard>
    </div>
  );
}
