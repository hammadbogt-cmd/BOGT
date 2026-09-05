"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type ChartValueFormat = "number" | "money";

export function SimpleBarChart({
  data,
  color = "#0f172a",
  height = 220,
  format = "number",
}: {
  data: { name: string; value: number }[];
  color?: string;
  height?: number;
  /** Server Components can't pass functions to client props (RSC boundary), so this
   * picks a formatter by name instead of accepting a formatter function. */
  format?: ChartValueFormat;
}) {
  const formatValue = (n: number) => (format === "money" ? `AED ${n.toLocaleString()}` : n.toLocaleString());

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} interval={0} angle={-20} textAnchor="end" height={50} />
        <YAxis tick={{ fontSize: 11, fill: "#64748b" }} width={48} />
        <Tooltip
          formatter={(value) => formatValue(Number(value ?? 0))}
          contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#e2e8f0" }}
        />
        <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
