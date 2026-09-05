import { getDashboardData } from "../../../lib/queries/dashboard";
import { KpiCard } from "../../../components/KpiCard";
import { ChartCard } from "../../../components/ChartCard";
import { SimpleBarChart } from "../../../components/charts/SimpleBarChart";
import { formatDateTime } from "../../../lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">
            What&apos;s selling, what&apos;s running out, and what needs your attention today.
          </p>
        </div>
        <span className="text-xs text-slate-400">Calculated {formatDateTime(data.lastUpdated)}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {data.kpis.map((kpi) => (
          <KpiCard key={kpi.key} kpi={kpi} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <ChartCard title="Inventory Value by Brand (Top 10)">
          <SimpleBarChart data={data.charts.inventoryValueByBrand} color="#0f172a" format="money" />
        </ChartCard>
        <ChartCard title="Stock by Location">
          <SimpleBarChart data={data.charts.stockByLocation} color="#2563eb" />
        </ChartCard>
        <ChartCard title="Stock Health (OOS / Near-OOS / Healthy)">
          <SimpleBarChart data={data.charts.stockHealthDistribution} color="#dc2626" />
        </ChartCard>
        <ChartCard title="BSR Distribution">
          <SimpleBarChart data={data.charts.bsrDistribution} color="#7c3aed" />
        </ChartCard>
        <ChartCard title="30-Day Sales Distribution">
          <SimpleBarChart data={data.charts.salesDistribution} color="#0891b2" />
        </ChartCard>
        <ChartCard title="Profitability Status">
          <SimpleBarChart data={data.charts.profitabilityDistribution} color="#16a34a" />
        </ChartCard>
      </div>
    </div>
  );
}
