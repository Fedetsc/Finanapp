import Link from "next/link";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { money } from "@/lib/currency";
import { Icon, PageHeader } from "@/components/ui";
import Amt from "@/components/Amt";
import Err from "@/components/Err";
import GoalBar from "@/components/GoalBar";
import GoalForm from "@/components/GoalForm";
import SubmitButton from "@/components/SubmitButton";
import { monthGoals } from "@/lib/goals";
import { incomeShares } from "@/lib/goal-math";
import { deleteGoal, saveHouseholdGoal, saveMemberGoal } from "@/lib/goal-actions";
import { fmt, todayAR } from "@/lib/util";
import { monthLabel } from "@/lib/visuals";

const shift = (ym: string, n: number) => { const d = new Date(ym + "-01T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };

/** Herramienta "Objetivo de gastos mensuales" (antes estaba desplegada en Hogar). Usa el modelo MonthlyGoal. */
export default async function Objetivo({ searchParams: sp }: { searchParams: { mes?: string; e?: string; meta?: string } }) {
  const m = await requireMember();
  // Mes del objetivo: ?mes=AAAA-MM (por defecto el actual).
  const current = todayAR().slice(0, 7);
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes ?? "") ? sp.mes! : current;
  const year = Number(mes.slice(0, 4)), month = Number(mes.slice(5, 7));
  const [members, goals, incomes, currencies] = await Promise.all([
    db.member.findMany({ where: { householdId: m.householdId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
    monthGoals(m.householdId, year, month),
    // Ingresos en pesos de los últimos 3 meses: sugieren el % de cada uno al dividir la meta por ingresos.
    db.transaction.groupBy({ by: ["memberId"], where: { householdId: m.householdId, voidedAt: null, type: "INCOME", account: { currency: "ARS" }, date: { gte: new Date(shift(current, -2) + "-01T00:00:00Z") } }, _sum: { amount: true } }),
    db.account.findMany({ where: { householdId: m.householdId }, distinct: ["currency"], select: { currency: true } }),
  ]);
  const shares = incomeShares(members.map((x) => incomes.find((i) => i.memberId === x.id)?._sum.amount ?? 0n));
  const nameOf = new Map(members.map((x) => [x.id, x.name]));
  const hGoal = goals.find((g) => g.memberId === null);
  const mGoals = goals.filter((g) => g.memberId !== null);
  const curs = ["ARS", ...currencies.map((c) => c.currency).filter((c) => c !== "ARS").sort()];
  const plain = (c: bigint) => fmt(c).slice(1); // "500.000,00" para precargar el formulario

  return (
    <div>
      <PageHeader title="Objetivo de gastos" back={{ href: "/hogar", label: "Hogar" }} right={
        <div className="pill gap-1 px-1.5 !py-1 text-xs">
          <Link href={`/hogar/objetivo?mes=${shift(mes, -1)}`} aria-label="Mes anterior" className="rounded-full p-1 hover:bg-bg"><Icon name="chevronLeft" className="h-4 w-4" /></Link>
          <span className="min-w-[6.5rem] text-center">{monthLabel(mes)}</span>
          <Link href={`/hogar/objetivo?mes=${shift(mes, 1)}`} aria-label="Mes siguiente" className="rounded-full p-1 hover:bg-bg"><Icon name="chevronRight" className="h-4 w-4" /></Link>
        </div>
      } />
      <Err e={sp.e} />
      {sp.meta === "ok" && <p role="status" className="mb-3 rounded-2xl bg-mint-soft px-4 py-3 text-sm text-pos">Objetivo guardado. <Link href="/" className="font-semibold underline">Ver en Inicio</Link></p>}
      {sp.meta === "borrada" && <p role="status" className="mb-3 rounded-2xl bg-surface px-4 py-3 text-sm shadow-soft">Objetivo borrado.</p>}
      {goals.length > 0 && (
        <ul className="card mb-4 divide-y divide-line py-1">
          {[...(hGoal ? [hGoal] : []), ...mGoals].map((g) => (
            <li key={g.id} className="space-y-2 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{g.memberId ? nameOf.get(g.memberId) ?? "Miembro" : "Hogar completo"}</p>
                  <p className="text-xs text-muted tabular-nums">Gastado <Amt c={g.currency}>{money(g.spent, g.currency)}</Amt> de <Amt c={g.currency}>{money(g.amount, g.currency)}</Amt> · {g.pct}%</p>
                </div>
                <form action={deleteGoal}><input type="hidden" name="id" value={g.id} /><SubmitButton className="text-xs font-medium text-muted hover:text-neg" pendingText="...">Borrar</SubmitButton></form>
              </div>
              <GoalBar pct={g.pct} level={g.level} label={`Objetivo de ${g.memberId ? nameOf.get(g.memberId) : "el hogar"}`} />
            </li>
          ))}
        </ul>
      )}
      <GoalForm key={mes} year={year} month={month} currencies={curs}
        members={members.map((x, i) => ({ id: x.id, name: x.name, pct: shares[i], me: x.id === m.id }))}
        household={hGoal ? { amount: plain(hGoal.amount), currency: hGoal.currency } : null}
        memberGoals={Object.fromEntries(mGoals.map((g) => [g.memberId!, plain(g.amount)]))}
        saveHousehold={saveHouseholdGoal} saveMember={saveMemberGoal} />
      <p className="mt-2 px-1 text-xs text-muted">Solo cuenta los gastos del mes en esa moneda (no ingresos ni transferencias). Es un aviso: nunca bloquea un gasto.</p>
    </div>
  );
}
