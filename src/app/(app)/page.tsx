import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { fdate, fmt, todayAR } from "@/lib/util";
import { refreshInstallments, today } from "@/lib/billing";
import { accountBalances } from "@/lib/balances";
import { currencySymbol, money } from "@/lib/currency";
import { accrueYields } from "@/lib/yields";
import HomeView from "@/components/HomeView";
import Amt from "@/components/Amt";
import { addDays } from "@/lib/dates";
import { monthGoals } from "@/lib/goals";
import GoalAlerts, { type GoalAlert } from "@/components/GoalAlerts";

/**
 * Inicio: entra entera en la pantalla del celular, sin scroll (100dvh): tarjeta principal compacta,
 * "Pagar suscripciones" (menú desde abajo) y los últimos 3 movimientos. Los gráficos están en /resumen.
 */
export default async function Home() {
  const m = await requireMember();
  const hid = m.householdId;
  // Las compras con tarjeta no son movimientos: solo cuentan cuando se paga cada cuota.
  // Rendimientos: si el cron no corrió, se acreditan los días pendientes al entrar.
  await Promise.all([refreshInstallments(hid), accrueYields(hid)]);

  const now = todayAR().slice(0, 7); // mes actual
  const monthStart = new Date(now + "-01T00:00:00Z");
  const nextMonth = new Date(monthStart); nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const [month, balances, vaults, members, accs, goals, subs, lastSubPay, recent] = await Promise.all([
    // Ingresos y gastos del mes: solo cuentas en ARS (no se mezclan monedas ni se convierte nada).
    db.transaction.groupBy({ by: ["type"], where: { householdId: hid, voidedAt: null, type: { in: ["INCOME", "EXPENSE"] }, account: { currency: "ARS" }, date: { gte: monthStart, lt: nextMonth } }, _sum: { amount: true } }),
    accountBalances(hid),
    db.$queryRaw<{ total: bigint | null }[]>`SELECT COALESCE(SUM("currentAmount"), 0)::bigint AS total FROM "SavingsVault" WHERE "householdId" = ${hid}`,
    db.member.findMany({ where: { householdId: hid }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.account.findMany({ where: { householdId: hid }, orderBy: { name: "asc" }, select: { id: true, name: true, currency: true, ownerMemberId: true } }),
    // Objetivos de gasto del mes (con lo gastado de cada uno).
    monthGoals(hid, Number(now.slice(0, 4)), Number(now.slice(5, 7))),
    // Pago rápido: mis suscripciones activas (solo el dueño las paga), la más cercana primero.
    db.subscription.findMany({ where: { householdId: hid, memberId: m.id, isActive: true }, orderBy: [{ nextPaymentDate: "asc" }, { name: "asc" }], select: { id: true, name: true, amount: true, currency: true, nextPaymentDate: true } }),
    // Cuenta con la que pagué la última suscripción (para el "Pagar con" por defecto).
    db.transaction.findFirst({ where: { householdId: hid, memberId: m.id, subscriptionId: { not: null } }, orderBy: { createdAt: "desc" }, select: { accountId: true } }),
    db.transaction.findMany({
      where: { householdId: hid, voidedAt: null }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 3,
      select: { id: true, type: true, amount: true, toAmount: true, description: true, voidedAt: true, date: true, category: { select: { name: true } }, account: { select: { name: true, currency: true } }, toAccount: { select: { name: true, currency: true } }, member: { select: { name: true } } },
    }),
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
  // Mes actual en números (MM/YYYY) para la tarjeta principal.
  const monthNum = `${now.slice(5, 7)}/${now.slice(0, 4)}`;
  // "US$ MEP 0,00" -> "US$ 0,00" (sin "MEP"), salvo que también haya dólar oficial y se confundan.
  const shortSymbol = (c: string) => (c === "USD_MEP" && !byCurrency.has("USD") ? "US$" : currencySymbol(c));
  const shortMoney = (v: bigint, c: string) => (c === "USD_MEP" && !byCurrency.has("USD") ? money(v, c).replace("US$ MEP", "US$") : money(v, c));
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
  const ownAccounts = accs.filter((a) => a.ownerMemberId === m.id).map(({ id, name, currency }) => ({ id, name, currency }));
  // "Por pagar" = próximo cobro dentro de los próximos 7 días (o atrasado).
  const weekEnd = addDays(today(), 7);
  const quickSubs = subs.map((s) => ({ id: s.id, name: s.name, amount: money(s.amount, s.currency), currency: s.currency, next: fdate(s.nextPaymentDate), due: s.nextPaymentDate <= weekEnd }));
  const defaultPayAccount = ownAccounts.find((a) => a.id === lastSubPay?.accountId)?.id ?? ownAccounts.find((a) => a.currency === subs[0]?.currency)?.id ?? ownAccounts[0]?.id ?? "";
  const dayLabel = (d: Date) => { const s = fdate(d); return s === fdate(today()) ? "Hoy" : s.slice(0, 5); };

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

  return <HomeView v={{ alerts, monthNum, foreignTotals, total, balance, disponible, ahorrado, people, hGoal, mGoals, nameOf, quickSubs, ownAccounts, defaultPayAccount, recent, dayLabel, shortSymbol, shortMoney }} />;
}
