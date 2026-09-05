import Link from "next/link";
import type { KpiCard as KpiCardType } from "../lib/queries/dashboard";

const TONE_CLASSES: Record<NonNullable<KpiCardType["tone"]>, string> = {
  default: "border-slate-200",
  danger: "border-red-200 bg-red-50/40",
  warning: "border-yellow-200 bg-yellow-50/40",
  success: "border-green-200 bg-green-50/40",
};

const VALUE_TONE_CLASSES: Record<NonNullable<KpiCardType["tone"]>, string> = {
  default: "text-slate-900",
  danger: "text-red-700",
  warning: "text-yellow-700",
  success: "text-green-700",
};

export function KpiCard({ kpi }: { kpi: KpiCardType }) {
  const tone = kpi.tone ?? "default";
  return (
    <Link
      href={kpi.href}
      className={`flex flex-col gap-1 rounded-lg border p-3.5 shadow-sm transition hover:shadow-md ${TONE_CLASSES[tone]} bg-white`}
    >
      <span className="text-xs font-medium text-slate-500">{kpi.label}</span>
      <span className={`text-xl font-semibold ${VALUE_TONE_CLASSES[tone]}`}>{kpi.value}</span>
    </Link>
  );
}
