"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDate } from "../../../../lib/format";

export function PurchasePriceChart({ points }: { points: { date: string; cost: number }[] }) {
  const chronological = [...points].reverse();
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={chronological} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="date" tickFormatter={(d) => formatDate(d)} tick={{ fontSize: 10, fill: "#64748b" }} />
        <YAxis tick={{ fontSize: 11, fill: "#64748b" }} width={44} />
        <Tooltip
          labelFormatter={(d) => formatDate(d as string)}
          formatter={(v) => [`AED ${Number(v).toFixed(2)}`, "Cost"]}
          contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#e2e8f0" }}
        />
        <Line type="monotone" dataKey="cost" stroke="#0f172a" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
