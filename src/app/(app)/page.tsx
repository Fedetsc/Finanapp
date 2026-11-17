import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { fmt, todayAR } from "@/lib/util";
import { refreshInstallments } from "@/lib/billing";
import { accountBalances } from "@/lib/balances";
import { categoryVisual, monthLabel } from "@/lib/visuals";
import HideAmountsToggle from "@/components/HideAmounts";
import ThemeToggle from "@/components/Theme";
import { currencyName, money } from "@/lib/currency";
import { arsEquivalent, referenceRates } from "@/lib/rates";
import { accrueYields } from "@/lib/yields";
import { HeroCard, Icon, IconTile } from "@/components/ui";
import Amt, { MASK } from "@/components/Amt";
import QuickAdd from "@/components/QuickAdd";
import { quickAdd } from "@/lib/quick-actions";
import Link from "next/link";
import { redirect } from "next/navigation";
import { monthGoals } from "@/lib/goals";
import GoalBar from "@/components/GoalBar";
import GoalAlerts, { type GoalAlert } from "@/components/GoalAlerts";
import MpLive from "@/components/MpLive";
import { mpLiveData } from "@/lib/mp-live";
import { resolvePending } from "@/lib/mp-actions";

/** Inicio: solo totales (los gráficos están en /resumen). */
export default async function Home({ searchParams: sp = {} }: { searchParams?: { code?: string; state?: string; error?: string } }) {
  // Vuelta del OAuth de Mercado Pago cuando el Redirect URI registrado es la home: se reenvía al callback,
  // que valida el state contra la cookie y cambia el code por tokens.
  if (sp.state && (sp.code || sp.error)) {
    const q = new URLSearchParams({ state: sp.state, ...(sp.code ? { code: sp.code } : {}), ...(sp.error ? { error: sp.error } : {}) });
    redirect(`/api/mp/callback?${q}`);
  }
  const m = await requireMember();
  const hid = m.householdId;
  // Las compras con tarjeta no son movimientos: solo cuentan cuando se paga cada cuota.
  // Rendimientos: si el cron no corrió, se acreditan los días pendientes al entrar.
  await Promise.all([refreshInstallments(hid), accrueYields(hid)]);

  const now = todayAR().slice(0, 7); // mes actual
  const monthStart = new Date(now + "-01T00:00:00Z");
  const nextMonth = new Date(monthStart); nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const monthAgo = new Date(Date.now() - 30 * 86400000);
  const lastOf = (type: "INCOME" | "EXPENSE") => db.transaction.findFirst({ where: { householdId: hid, memberId: m.id, type, voidedAt: null }, orderBy: { createdAt: "desc" }, select: { accountId: true } });
  const [month, balances, vaults, members, accs, rates, categories, usage, lastExp, lastInc, goals, mp] = await Promise.all([
    // Ingresos y gastos del mes: solo cuentas en ARS (no se mezclan monedas ni se convierte nada).
    db.transaction.groupBy({ by: ["type"], where: { householdId: hid, voidedAt: null, type: { in: ["INCOME", "EXPENSE"] }, account: { currency: "ARS" }, date: { gte: monthStart, lt: nextMonth } }, _sum: { amount: true } }),
    accountBalances(hid),
    db.$queryRaw<{ total: bigint | null }[]>`SELECT COALESCE(SUM("currentAmount"), 0)::bigint AS total FROM "SavingsVault" WHERE "householdId" = ${hid}`,
    db.member.findMany({ where: { householdId: hid }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.account.findMany({ where: { householdId: hid }, orderBy: { name: "asc" }, select: { id: true, name: true, currency: true, ownerMemberId: true } }),
    referenceRates(hid),
    // Para el menú rápido de Ingresos/Gastos: categorías, las más usadas del último mes y la última cuenta usada.
    db.category.findMany({ where: { householdId: hid }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.transaction.groupBy({ by: ["categoryId", "type"], where: { householdId: hid, voidedAt: null, type: { in: ["INCOME", "EXPENSE"] }, date: { gte: monthAgo } }, _count: { _all: true } }),
    lastOf("EXPENSE"),
    lastOf("INCOME"),
    // Objetivos de gasto del mes (con lo gastado de cada uno).
    monthGoals(hid, Number(now.slice(0, 4)), Number(now.slice(5, 7))),
    // Mercado Pago: estado de la sincronización y movimientos para categorizar.
    mpLiveData(m),
  ]);

  // Saldos agrupados por moneda: nunca se suman monedas distintas.
  // Disponible (ARS) = saldos de las cuentas en pesos (ya descuentan lo apartado y suman lo retirado).
  // Ahorrado = suma de los sobres (en pesos). Total ARS = Disponible + Ahorrado: apartar no cambia el total.
  const accOf = new Map(accs.map((a) => [a.id, a]));
  const byCurrency = new Map<string, bigint>();
  // Saldo de cada miembro = suma de los saldos de sus cuentas, separado por moneda.
  const byMember = new Map<string, Map<string, bigint>>();
  balances.forEach((v, id) => {
    const a = accOf.get(id);
    const c = a?.currency ?? "ARS";
    byCurrency.set(c, (byCurrency.get(c) ?? 0n) + v);
    if (!a) return;
    const mm = byMember.get(a.ownerMemberId) ?? new Map<string, bigint>();
    mm.set(c, (mm.get(c) ?? 0n) + v);
    byMember.set(a.ownerMemberId, mm);
  });
  const disponible = byCurrency.get("ARS") ?? 0n;
  const ahorrado = vaults[0]?.total ?? 0n;
  const total = disponible + ahorrado;
  const foreignTotals = [...byCurrency].filter(([c]) => c !== "ARS").sort(([a], [b]) => a.localeCompare(b));

  // Primero yo, después los demás.
  const people = [...members.filter((x) => x.id === m.id), ...members.filter((x) => x.id !== m.id)].map((p) => {
    const mm = byMember.get(p.id) ?? new Map<string, bigint>();
    return { ...p, ars: mm.get("ARS") ?? 0n, foreign: [...mm].filter(([c, v]) => c !== "ARS" && v !== 0n).sort(([a], [b]) => a.localeCompare(b)) };
  });

  // Ingresos/gastos solo leen Transaction INCOME/EXPENSE: transferencias y ahorro quedan afuera.
  const inc = month.find((x) => x.type === "INCOME")?._sum.amount ?? 0n;
  const exp = month.find((x) => x.type === "EXPENSE")?._sum.amount ?? 0n;
  const balance = inc - exp;
  const usedPct = inc > 0n ? Number((exp * 100n) / inc) : null;
  // Top 5 por tipo (más usadas en el último mes); si faltan, se completa con las demás, sin repetir las del otro tipo.
  const looksIncome = (n: string) => categoryVisual(n).tone === "green";
  const topFor = (type: "INCOME" | "EXPENSE") => {
    const count = (t: string) => new Map(usage.filter((u) => u.type === t && u.categoryId).map((u) => [u.categoryId!, u._count._all]));
    const mine = count(type), other = count(type === "INCOME" ? "EXPENSE" : "INCOME");
    const used = categories.filter((c) => mine.has(c.id)).sort((a, b) => mine.get(b.id)! - mine.get(a.id)!);
    const rest = categories.filter((c) => !mine.has(c.id) && !other.has(c.id))
      // Sin historial: primero las que "parecen" del tipo (Sueldo para ingresos; Supermercado, Transporte... para gastos).
      .sort((x, y) => Number(looksIncome(y.name) === (type === "INCOME")) - Number(looksIncome(x.name) === (type === "INCOME")));
    return [...used, ...rest].slice(0, 5);
  };
  const ownAccounts = accs.filter((a) => a.ownerMemberId === m.id).map(({ id, name, currency }) => ({ id, name, currency }));
  const firstName = (m.name || m.email.split("@")[0]).split(" ")[0];

  // Objetivos: la barra de cada miembro se ve para todos; los avisos son del hogar (para todos) y de mi meta (solo para mí).
  const hGoal = goals.find((g) => g.memberId === null);
  const nameOf = new Map(members.map((x) => [x.id, x.name]));
  const mGoals = people.map((p) => goals.find((g) => g.memberId === p.id)).filter((g): g is NonNullable<typeof g> => !!g);
  const myGoal = mGoals.find((g) => g.memberId === m.id);
  const alerts: GoalAlert[] = [...(hGoal ? [hGoal] : []), ...(myGoal ? [myGoal] : [])].flatMap((g) => {
    if (g.level === "ok") return [];
    const who = g.memberId ? "tu objetivo" : "el objetivo del hogar";
    return [{
      key: `${g.id}:${g.level}:${g.amount}`,
      level: g.level,
      title: g.level === "over" ? `Alcanzaste ${who} de gastos de este mes` : `¡Ojo! Ya gastaste el 90% de ${who} de este mes`,
      text: g.level === "over"
        ? <>Gastado <Amt c={g.currency}>{money(g.spent, g.currency)}</Amt> de <Amt c={g.currency}>{money(g.amount, g.currency)}</Amt>.</>
        : <>Te quedan <Amt c={g.currency}>{money(g.remaining, g.currency)}</Amt>.</>,
    }];
  });

  return (
    <div>
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted">{m.household.name} · {monthLabel(now, false)}</p>
          <h1 className="truncate text-[28px] font-extrabold leading-tight tracking-tight">Hola, {firstName}</h1>
        </div>
        <ThemeToggle />
      </header>

      <GoalAlerts alerts={alerts} />
      {mp && <MpLive data={mp} action={resolvePending} />}

      <HeroCard>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-white/70">{foreignTotals.length ? "Total ARS" : "Saldo total"}</p>
          <HideAmountsToggle tone="light" />
        </div>
        <p className="mt-1 text-[40px] font-extrabold leading-none tracking-tight tabular-nums"><Amt>{fmt(total)}</Amt></p>
        <span className={`mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${balance >= 0n ? "bg-mint/20 text-mint" : "bg-[#FDECEE]/20 text-[#FFB3B6]"}`}>
          <Icon name="trend" className="h-3.5 w-3.5" />{balance >= 0n ? "+" : ""}<Amt>{fmt(balance)}</Amt> este mes
        </span>
        <dl className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/10 px-3.5 py-2.5"><dt className="text-[11px] text-white/60">Disponible para gastar</dt><dd className="font-bold tabular-nums"><Amt>{fmt(disponible)}</Amt></dd></div>
          <div className="rounded-2xl bg-white/10 px-3.5 py-2.5"><dt className="text-[11px] text-white/60">Ahorrado</dt><dd className="font-bold tabular-nums"><Amt>{fmt(ahorrado)}</Amt></dd></div>
        </dl>
        {foreignTotals.length > 0 && (
          <dl className="mt-3 space-y-1.5 border-t border-white/15 pt-3">
            {foreignTotals.map(([c, v]) => (
              <div key={c} className="flex items-baseline justify-between gap-3">
                <dt className="text-sm text-white/70">Total {currencyName(c)}</dt>
                <dd className="text-right"><span className="block font-bold tabular-nums"><Amt c={c}>{money(v, c)}</Amt></span>{arsEquivalent(v, c, rates) && <span className="block text-[11px] text-white/60 tabular-nums"><Amt mask={`≈ $ ${MASK}`}>{arsEquivalent(v, c, rates)}</Amt></span>}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="mt-3 border-t border-white/15 pt-3">
          <p className="text-[11px] text-white/60">En las cuentas de cada uno</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {people.map((p) => (
              <li key={p.id} className="flex min-w-0 items-baseline gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm">
                <span className="truncate text-white/75">{p.name}</span>
                <b className="tabular-nums"><Amt>{fmt(p.ars)}</Amt></b>
                {p.foreign.map(([c, v]) => <span key={c} className="text-xs text-white/60 tabular-nums">· <Amt c={c}>{money(v, c)}</Amt></span>)}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-3 border-t border-white/15 pt-3">
          {hGoal || mGoals.length ? (
            <div className="space-y-3">
              {hGoal && (
                <div>
                  <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-white/70">
                    <span>Objetivo hogar: gastado <b className="text-white tabular-nums"><Amt c={hGoal.currency}>{money(hGoal.spent, hGoal.currency)}</Amt></b> de <span className="tabular-nums"><Amt c={hGoal.currency}>{money(hGoal.amount, hGoal.currency)}</Amt></span></span>
                    <span className={hGoal.remaining < 0n ? "font-semibold text-[#FFB3B6]" : "text-white/80"}>{hGoal.remaining >= 0n ? "Te queda " : "Te pasaste "}<b className="tabular-nums"><Amt c={hGoal.currency}>{money(hGoal.remaining >= 0n ? hGoal.remaining : -hGoal.remaining, hGoal.currency)}</Amt></b></span>
                  </p>
                  <div className="mt-1.5"><GoalBar pct={hGoal.pct} level={hGoal.level} tone="light" label="Objetivo de gastos del hogar" /></div>
                </div>
              )}
              {mGoals.length > 0 && (
                <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {mGoals.map((g) => (
                    <li key={g.id} className="min-w-0">
                      <p className="truncate text-[11px] text-white/70"><span className="text-white/90">{nameOf.get(g.memberId!)}</span>: <span className="tabular-nums"><Amt c={g.currency}>{money(g.spent, g.currency)}</Amt></span> de <span className="tabular-nums"><Amt c={g.currency}>{money(g.amount, g.currency)}</Amt></span></p>
                      <div className="mt-1"><GoalBar pct={g.pct} level={g.level} tone="light" size="sm" label={`Objetivo de ${nameOf.get(g.memberId!)}`} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <Link href="/hogar/objetivo" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/85 transition hover:bg-white/20 active:scale-95">
              <Icon name="target" className="h-3.5 w-3.5" />Definir objetivo
            </Link>
          )}
        </div>
      </HeroCard>

      <QuickAdd action={quickAdd} accounts={ownAccounts} categories={categories}
        lastAccount={{ EXPENSE: lastExp?.accountId ?? null, INCOME: lastInc?.accountId ?? null }}
        top={{ EXPENSE: topFor("EXPENSE"), INCOME: topFor("INCOME") }}
        income={<>
          <span className="flex items-center justify-between"><IconTile icon="down" tone="green" size="sm" /><Icon name="plus" className="h-4 w-4 text-muted" /></span>
          <span className="mt-4 block text-sm text-muted">Ingresos</span>
          <span className="block text-xl font-extrabold tracking-tight tabular-nums"><Amt>{fmt(inc)}</Amt></span>
        </>}
        expense={<>
          <span className="flex items-center justify-between"><IconTile icon="up" tone="blue" size="sm" /><Icon name="plus" className="h-4 w-4 text-muted" /></span>
          <span className="mt-4 block text-sm text-muted">Gastos</span>
          <span className="block text-xl font-extrabold tracking-tight tabular-nums"><Amt>{fmt(exp)}</Amt></span>
        </>} />

      <div className="card mt-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold">Gastos del mes vs. ingresos</h2>
          {usedPct !== null && <span className={`text-sm font-bold ${usedPct > 100 ? "text-neg" : usedPct > 85 ? "text-warn" : "text-pos"}`}>{usedPct}%</span>}
        </div>
        {usedPct === null ? (
          <p className="mt-2 text-sm text-muted">Todavía no hay ingresos este mes{exp > 0n ? <>: llevan gastado <Amt>{fmt(exp)}</Amt></> : ""}.</p>
        ) : (
          <>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-bg" role="progressbar" aria-valuenow={usedPct} aria-valuemin={0} aria-valuemax={100} aria-label="Porcentaje de ingresos gastado">
              <div className={`h-full rounded-full ${usedPct > 100 ? "bg-neg" : "bg-gradient-to-r from-mint to-pos"}`} style={{ width: `${Math.min(100, usedPct)}%` }} />
            </div>
            <p className="mt-3 text-sm text-muted">Gastado <b className="text-text"><Amt>{fmt(exp)}</Amt></b> / <Amt>{fmt(inc)}</Amt></p>
            <p className="mt-0.5 text-xs text-muted">{balance >= 0n ? <>Van bien: les quedan <Amt>{fmt(balance)}</Amt> este mes 🌿</> : <>Se pasaron <Amt>{fmt(-balance)}</Amt> de lo que entró este mes.</>}</p>
          </>
        )}
      </div>
    </div>
  );
}
