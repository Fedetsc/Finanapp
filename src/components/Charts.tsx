"use client";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART, type Slice } from "@/lib/chart-colors";

const tip = {
  contentStyle: { background: "#FFFFFF", border: "none", borderRadius: 14, fontSize: 12, boxShadow: "0 6px 20px rgba(16,24,40,.08)" },
  itemStyle: { color: "#1E2B3A" },
  labelStyle: { color: "#8A94A3" },
};
const money = (v: unknown) => "$" + Number(v).toLocaleString("es-AR", { maximumFractionDigits: 0 });

/** Donut con total al centro y leyenda propia debajo (porcentaje por categoría). */
export function CategoryDonut({ pie, empty, height = "h-56", centerLabel = "Total gastado" }: { pie: Slice[]; empty: string; height?: string; centerLabel?: string }) {
  if (!pie.length) return <p className="py-14 text-center text-sm text-muted">{empty}</p>;
  const total = pie.reduce((a, s) => a + s.value, 0);
  return (
    <div>
      <div className={`relative ${height}`}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={pie} dataKey="value" nameKey="name" innerRadius="70%" outerRadius="96%" paddingAngle={pie.length > 1 ? 2 : 0} stroke="none" startAngle={90} endAngle={-270}>
              {pie.map((s) => <Cell key={s.name} fill={s.color} />)}
            </Pie>
            <Tooltip {...tip} formatter={money} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xs text-muted">{centerLabel}</span>
          <span className="text-xl font-extrabold tracking-tight">{money(total)}</span>
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {pie.map((s) => (
          <li key={s.name} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{s.name}</span>
            <span className="text-muted">{Math.round((s.value / total) * 100)}%</span>
            <span className="w-24 text-right font-semibold">{money(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MonthlyBars({ bars }: { bars: { mes: string; Ingresos: number; Gastos: number }[] }) {
  return (
    <div>
      <div className="mb-3 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART.income }} />Ingresos</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART.expense }} />Gastos</span>
      </div>
      <div className="h-56">
        <ResponsiveContainer>
          <BarChart data={bars} barGap={4}>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis dataKey="mes" tick={{ fontSize: 12, fill: CHART.axis }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip {...tip} formatter={money} cursor={{ fill: "rgba(45,74,99,.05)" }} />
            <Bar dataKey="Ingresos" fill={CHART.income} radius={[6, 6, 0, 0]} maxBarSize={22} />
            <Bar dataKey="Gastos" fill={CHART.expense} radius={[6, 6, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Bloque principal del hogar: barras de 6 meses + donut del mes. */
export default function Charts({ bars, pie }: { bars: { mes: string; Ingresos: number; Gastos: number }[]; pie: Slice[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card">
        <h3 className="mb-4 font-bold">Ingresos y gastos · 6 meses</h3>
        <MonthlyBars bars={bars} />
      </div>
      <div className="card">
        <h3 className="mb-4 font-bold">Gastos del mes por categoría</h3>
        <CategoryDonut pie={pie} empty="Todavía no hay gastos este mes." />
      </div>
    </div>
  );
}
