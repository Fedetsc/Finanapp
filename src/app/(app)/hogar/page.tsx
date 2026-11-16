import Link from "next/link";
import { db } from "@/lib/db";
import { listMemberships, requireMember, roleLabel, isAdmin } from "@/lib/session";
import { logout } from "@/lib/household-actions";
import { accountBalances } from "@/lib/balances";
import { money } from "@/lib/currency";
import { arsEquivalent, referenceRates } from "@/lib/rates";
import { ACCOUNT_VISUAL } from "@/lib/visuals";
import HouseholdSwitcher from "@/components/HouseholdSwitcher";
import CopyButton from "@/components/CopyButton";
import { Avatar, AvatarStack, HeroCard, Icon, IconTile, PageHeader, SectionHeader } from "@/components/ui";
import Amt, { MASK } from "@/components/Amt";
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

const LINKS = [
  ["/cuentas", "Cuentas", "bank", "blue", "Saldos de cada cuenta"],
  ["/ahorro", "Ahorro", "piggy", "green", "Plata apartada"],
  ["/tarjetas", "Tarjetas", "card", "violet", "Compras en cuotas"],
  ["/suscripciones", "Suscripciones", "repeat", "orange", "Cobros automáticos"],
  ["/categorias", "Categorías", "tag", "pink", "Para clasificar gastos"],
] as const;

/** Hub del hogar (como el ejemplo): miembros, código de invitación, cuentas, secciones y cambio de hogar. */
export default async function Hogar({ searchParams: sp }: { searchParams: { mes?: string; e?: string; meta?: string } }) {
  const m = await requireMember();
  // Mes del objetivo: ?mes=AAAA-MM (por defecto el actual).
  const current = todayAR().slice(0, 7);
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes ?? "") ? sp.mes! : current;
  const year = Number(mes.slice(0, 4)), month = Number(mes.slice(5, 7));
  const [members, accounts, balances, all, rates, goals, incomes, currencies] = await Promise.all([
    db.member.findMany({ where: { householdId: m.householdId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, role: true } }),
    db.account.findMany({ where: { householdId: m.householdId, ownerMemberId: m.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, type: true, currency: true, openingBalance: true } }),
    accountBalances(m.householdId),
    listMemberships(m.userId),
    referenceRates(m.householdId),
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
      <PageHeader title="Hogar" />

      <HeroCard>
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-mint"><Icon name="home" className="h-6 w-6" /></span>
          <div className="min-w-0"><p className="text-sm text-white/70">Tu hogar</p><p className="truncate text-xl font-extrabold tracking-tight">{m.household.name}</p></div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <AvatarStack names={members.map((x) => x.name)} />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-mint/20 px-3 py-1 text-xs font-semibold text-mint">
            <span className="h-1.5 w-1.5 rounded-full bg-mint" />{members.length} {members.length === 1 ? "miembro" : "miembros"}
          </span>
        </div>
        <p className="mt-3 text-sm text-white/80">{members.map((x) => `${x.name}${isAdmin(x.role) ? " (admin)" : ""}`).join(" · ")}</p>
      </HeroCard>

      <div className="card mt-4 border border-mint/60">
        <div className="flex items-center gap-3">
          <IconTile icon="users" tone="green" />
          <div><p className="font-bold">Código de invitación</p><p className="text-xs text-muted">Compartilo para sumar a otra persona</p></div>
        </div>
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-mint-soft p-3">
          <code className="min-w-0 flex-1 select-all truncate font-mono text-sm font-semibold text-primary">{m.household.inviteCode}</code>
          <CopyButton text={m.household.inviteCode} />
        </div>
      </div>

      <section id="objetivo" className="scroll-mt-6">
        <SectionHeader title="Objetivo de gastos mensuales" action={
          <div className="pill gap-1 px-1.5 !py-1 text-xs">
            <Link href={`/hogar?mes=${shift(mes, -1)}#objetivo`} aria-label="Mes anterior" className="rounded-full p-1 hover:bg-bg"><Icon name="chevronLeft" className="h-4 w-4" /></Link>
            <span className="min-w-[6.5rem] text-center">{monthLabel(mes)}</span>
            <Link href={`/hogar?mes=${shift(mes, 1)}#objetivo`} aria-label="Mes siguiente" className="rounded-full p-1 hover:bg-bg"><Icon name="chevronRight" className="h-4 w-4" /></Link>
          </div>
        } />
        <Err e={sp.e} />
        {sp.meta === "ok" && <p role="status" className="mb-3 rounded-2xl bg-mint-soft px-4 py-3 text-sm text-pos">Objetivo guardado.</p>}
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
      </section>

      <SectionHeader title="Mis cuentas" action={<Link href="/cuentas" className="inline-flex items-center gap-1 text-sm font-semibold text-primary"><Icon name="plus" className="h-4 w-4" />Añadir</Link>} />
      {accounts.length === 0 ? (
        <div className="card text-center text-sm text-muted">Todavía no tenés cuentas en este hogar. <Link href="/cuentas" className="font-semibold text-primary">Creá una</Link></div>
      ) : (
        <ul className="card divide-y divide-line py-1">
          {accounts.map((a) => {
            const v = ACCOUNT_VISUAL[a.type] ?? ACCOUNT_VISUAL.BANK;
            return (
              <li key={a.id} className="flex items-center gap-3.5 py-3.5">
                <IconTile icon={v.icon} tone={v.tone} />
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{a.name}</span><span className="text-xs text-muted">Personal</span></span>
                <span className="flex flex-col items-end">
                  <span className="font-bold tabular-nums"><Amt c={a.currency}>{money(balances.get(a.id) ?? a.openingBalance, a.currency)}</Amt></span>
                  {arsEquivalent(balances.get(a.id) ?? a.openingBalance, a.currency, rates) && <span className="text-[11px] text-muted tabular-nums"><Amt mask={`≈ $ ${MASK}`}>{arsEquivalent(balances.get(a.id) ?? a.openingBalance, a.currency, rates)}</Amt></span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <SectionHeader title="Secciones" />
      <ul className="card divide-y divide-line py-1">
        {LINKS.map(([href, label, icon, tone, hint]) => (
          <li key={href}>
            <Link href={href} className="flex items-center gap-3.5 py-3.5">
              <IconTile icon={icon} tone={tone} />
              <span className="min-w-0 flex-1"><span className="block font-semibold">{label}</span><span className="text-xs text-muted">{hint}</span></span>
              <Icon name="chevronRight" className="h-4 w-4 text-muted" />
            </Link>
          </li>
        ))}
      </ul>

      <SectionHeader title="Tus hogares" />
      <div className="card p-3"><HouseholdSwitcher currentId={m.householdId} all={all} /></div>

      <div className="card mt-4 flex items-center gap-3.5">
        <Avatar name={m.name || m.email} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{m.name || m.email}</p>
          <p className="truncate text-xs text-muted">{m.email}</p>
          <p className="text-xs text-muted">{roleLabel(m.role)} en {m.household.name}</p>
        </div>
      </div>
      <form action={logout} className="mt-3">
        <button className="card flex w-full items-center gap-3 font-semibold text-neg hover:bg-[#FDECEE]/40 dark:hover:bg-neg/10"><Icon name="logout" className="h-5 w-5" />Cerrar sesión</button>
      </form>
    </div>
  );
}
