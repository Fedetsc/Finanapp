"use client";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { Slice } from "@/lib/colors";

const tip = { contentStyle: { background: "rgb(var(--surface))", border: "1px solid rgb(var(--line))", borderRadius: 8, fontSize: 12 }, itemStyle: { color: "rgb(var(--text))" } };
const money = (v: unknown) => "$" + Number(v).toLocaleString("es-AR");

export function CategoryDonut({ pie, empty, height = "h-64" }: { pie: Slice[]; empty: string; height?: string }) {
  if (!pie.length) return <p className="py-16 text-center text-sm text-muted">{empty}</p>;
  return (
    <div className={height}>
      <ResponsiveContainer>
        <PieChart>
          <Pie data={pie} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%">
            {pie.map((s) => <Cell key={s.name} fill={s.color} />)}
          </Pie>
          <Tooltip {...tip} formatter={money} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Charts({ bars, pie }: { bars: { mes: string; Ingresos: number; Gastos: number }[]; pie: Slice[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="card">
        <h3 className="mb-3 text-sm font-medium">Ingresos y gastos, últimos 6 meses</h3>
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={bars}>
              <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
              <XAxis dataKey="mes" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip {...tip} formatter={money} cursor={{ fill: "rgb(var(--line) / 0.4)" }} />
              <Legend />
              <Bar dataKey="Ingresos" fill="#21865B" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Gastos" fill="#C65353" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="card">
        <h3 className="mb-3 text-sm font-medium">Gastos del mes por categoría</h3>
        <CategoryDonut pie={pie} empty="Todavía no hay gastos este mes." />
      </div>
    </div>
  );
}
