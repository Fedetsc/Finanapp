"use client";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const COLORS = ["#334B67", "#647B91", "#21865B", "#D9A441", "#C65353", "#8FA3B8", "#5E9C85", "#B5A07A"];
const tip = { contentStyle: { background: "rgb(var(--surface))", border: "1px solid rgb(var(--line))", borderRadius: 8, fontSize: 12 } };
const money = (v: unknown) => "$" + Number(v).toLocaleString("es-AR");

export default function Charts({ bars, pie }: { bars: { mes: string; Ingresos: number; Gastos: number }[]; pie: { name: string; value: number }[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="card">
        <h2 className="mb-3 text-sm font-medium">Ingresos y gastos, últimos 6 meses</h2>
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={bars}>
              <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
              <XAxis dataKey="mes" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip {...tip} formatter={money} />
              <Legend />
              <Bar dataKey="Ingresos" fill="#21865B" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Gastos" fill="#C65353" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="card">
        <h2 className="mb-3 text-sm font-medium">Gastos del mes por categoría</h2>
        {pie.length ? (
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85}>
                  {pie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip {...tip} formatter={money} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="py-24 text-center text-sm text-muted">Todavía no registraste gastos este mes.</p>}
      </div>
    </div>
  );
}
