import Link from "next/link";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { fmt, todayAR } from "@/lib/util";
import { categoryVisual, monthLabel } from "@/lib/visuals";
import { COLORS } from "@/lib/chart-colors";
import { CategoryDonut } from "@/components/Charts";
import { Empty, Icon, IconTile, PageHeader } from "@/components/ui";

const shift = (ym: string, n: number) => { const d = new Date(ym + "-01T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
const start = (ym: string) => new Date(ym + "-01T00:00:00Z");

/** Gastos o ingresos de un mes por categoría (sin transferencias ni anulados), con comparación vs. el mes anterior. */
export default async function Resumen({ searchParams }: { searchParams: { mes?: string; tipo?: string } }) {
  const m = await requireMember();
  const current = todayAR().slice(0, 7);
  const mes = /^\d{4}-\d{2}$/.test(searchParams.mes ?? "") && searchParams.mes! <= current ? searchParams.mes! : current;
  const income = searchParams.tipo === "ingresos";
  const type = income ? "INCOME" : "EXPENSE";
  const prev = shift(mes, -1);

  const rows = await db.transaction.findMany({
    where: { householdId: m.householdId, voidedAt: null, type, account: { currency: "ARS" }, date: { gte: start(prev), lt: start(shift(mes, 1)) } },
    select: { amount: true, date: true, category: { select: { name: true } } },
  });
  const inMes = rows.filter((r) => r.date.toISOString().startsWith(mes));
  const total = inMes.reduce((a, r) => a + r.amount, 0n);
  const prevTotal = rows.filter((r) => r.date.toISOString().startsWith(prev)).reduce((a, r) => a + r.amount, 0n);
  const byCat = new Map<string, bigint>();
  inMes.forEach((r) => { const n = r.category?.name ?? "Sin categoría"; byCat.set(n, (byCat.get(n) ?? 0n) + r.amount); });
  const cats = [...byCat].sort((a, b) => (b[1] > a[1] ? 1 : -1)).map(([name, v], i) => ({ name, cents: v, value: Number(v) / 100, color: COLORS[i % COLORS.length] }));
  const diff = prevTotal > 0n ? Math.round(Number(((total - prevTotal) * 1000n) / prevTotal) / 10) : null;
  const q = (p: Record<string, string>) => "/resumen?" + new URLSearchParams({ ...(mes !== current ? { mes } : {}), ...(income ? { tipo: "ingresos" } : {}), ...p }).toString();
  const better = diff !== null && (income ? diff >= 0 : diff <= 0);

  return (
    <div>
      <PageHeader title="Resumen" subtitle={`${m.household.name} · cuentas en ARS`} right={
        <div className="pill gap-1 px-1.5">
          <Link href={q({ mes: prev })} aria-label="Mes anterior" className="rounded-full p-1.5 hover:bg-bg"><Icon name="chevronLeft" className="h-4 w-4" /></Link>
          <span className="min-w-[7.5rem] text-center">{monthLabel(mes)}</span>
          {mes < current ? <Link href={q({ mes: shift(mes, 1) })} aria-label="Mes siguiente" className="rounded-full p-1.5 hover:bg-bg"><Icon name="chevronRight" className="h-4 w-4" /></Link> : <span className="w-7" />}
        </div>
      } />

      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-surface p-1 shadow-soft">
        {[["Gastos", false], ["Ingresos", true]].map(([l, inc]) => (
          <Link key={String(l)} href={q({ tipo: inc ? "ingresos" : "gastos" })} aria-current={income === inc ? "page" : undefined}
            className={`rounded-xl py-2.5 text-center text-sm font-semibold transition ${income === inc ? "bg-primary text-white" : "text-muted hover:text-text"}`}>{l}</Link>
        ))}
      </div>

      {cats.length === 0 ? (
        <div className="mt-4"><Empty icon="pie">No hay {income ? "ingresos" : "gastos"} en {monthLabel(mes)}.</Empty></div>
      ) : (
        <>
          <div className="card mt-4">
            <CategoryDonut pie={cats} height="h-60" centerLabel={income ? "Total ingresado" : "Total gastado"} empty="" />
            {diff !== null && (
              <p className={`mt-4 rounded-full px-4 py-2 text-center text-sm font-medium ${better ? "bg-mint-soft text-pos" : "bg-[#FDECEE] text-neg"}`}>
                {income ? "Ingresaron" : "Gastaron"} {Math.abs(diff)}% {diff <= 0 ? "menos" : "más"} que en {monthLabel(prev, false).toLowerCase()}
              </p>
            )}
          </div>

          <h2 className="section-title mb-3 mt-7">Por categoría</h2>
          <ul className="card divide-y divide-line py-1">
            {cats.map((c) => {
              const pct = total > 0n ? Number((c.cents * 100n) / total) : 0;
              const v = categoryVisual(c.name, type);
              return (
                <li key={c.name} className="py-4">
                  <div className="flex items-center gap-3">
                    <IconTile icon={v.icon} tone={v.tone} />
                    <span className="min-w-0 flex-1 truncate font-semibold">{c.name}</span>
                    <span className="text-right"><b className="block tabular-nums">{fmt(c.cents)}</b><span className="text-xs text-muted">{pct}%</span></span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.color }} /></div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
