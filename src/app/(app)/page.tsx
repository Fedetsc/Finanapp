import Link from "next/link";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { fmt, todayAR } from "@/lib/util";
import { processDueSubscriptions, refreshInstallments } from "@/lib/billing";
import { accountBalances } from "@/lib/balances";
import { monthLabel, relDay } from "@/lib/visuals";
import Charts, { CategoryDonut } from "@/components/Charts";
import { COLORS, type Slice } from "@/lib/chart-colors";
import MovementRow from "@/components/MovementRow";
import CopyButton from "@/components/CopyButton";
import { AvatarStack, Avatar, HeroCard, Icon, IconTile, Notice, SectionHeader } from "@/components/ui";

type Tx = { type: string; amount: bigint; memberId: string; date: Date; category: { name: string } | null };

export default async function Home() {
  const m = await requireMember();
  const hid = m.householdId;
  // Cobros automáticos: las suscripciones vencidas se registran como gasto al entrar al resumen.
  // Las compras con tarjeta no son movimientos: solo cuentan cuando se paga cada cuota.
  const [charged] = await Promise.all([processDueSubscriptions(hid), refreshInstallments(hid)]);

  const today = todayAR();
  const now = today.slice(0, 7); // mes actual: mismo filtro para el bloque total y los de cada miembro
  const keys = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now + "-01T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() - (5 - i));
    return d.toISOString().slice(0, 7);
  });
  const [txs, balances, vaults, members, recent] = await Promise.all([
    db.transaction.findMany({ where: { householdId: hid, voidedAt: null, date: { gte: new Date(keys[0] + "-01T00:00:00Z") } }, select: { type: true, amount: true, memberId: true, date: true, category: { select: { name: true } } } }),
    accountBalances(hid),
    db.$queryRaw<{ total: bigint | null }[]>`SELECT COALESCE(SUM("currentAmount"), 0)::bigint AS total FROM "SavingsVault" WHERE "householdId" = ${hid}`,
    db.member.findMany({ where: { householdId: hid }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.transaction.findMany({ where: { householdId: hid, voidedAt: null }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 5, include: { category: { select: { name: true } }, account: { select: { name: true } }, toAccount: { select: { name: true } }, member: { select: { name: true } } } }),
  ]);

  // Disponible = suma de los saldos de todas las cuentas (ya descuentan lo apartado y suman lo retirado).
  // Ahorrado = suma de los sobres. Saldo total = Disponible + Ahorrado: apartar no cambia el total.
  const disponible = [...balances.values()].reduce((a, b) => a + b, 0n);
  const ahorrado = vaults[0]?.total ?? 0n;
  const total = disponible + ahorrado;

  // Ingresos/gastos solo leen Transaction INCOME/EXPENSE: transferencias y ahorro quedan afuera.
  const inMonth = (k: string) => (x: Tx) => x.date.toISOString().startsWith(k);
  const sum = (list: Tx[], t: string) => list.filter((x) => x.type === t).reduce((a, x) => a + x.amount, 0n);
  const monthTx: Tx[] = txs.filter(inMonth(now));
  const bars = keys.map((k) => { const l = txs.filter(inMonth(k)); return { mes: k.slice(5) + "/" + k.slice(2, 4), Ingresos: Number(sum(l, "INCOME")) / 100, Gastos: Number(sum(l, "EXPENSE")) / 100 }; });
  const inc = sum(monthTx, "INCOME"), exp = sum(monthTx, "EXPENSE"), trf = sum(monthTx, "TRANSFER");
  const trfCount = monthTx.filter((x) => x.type === "TRANSFER").length;
  const balance = inc - exp;
  const usedPct = inc > 0n ? Number((exp * 100n) / inc) : null;

  const byCategory = (list: Tx[]) => {
    const map = new Map<string, bigint>();
    list.filter((x) => x.type === "EXPENSE").forEach((x) => { const n = x.category?.name ?? "Sin categoría"; map.set(n, (map.get(n) ?? 0n) + x.amount); });
    return [...map].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));
  };
  // Color fijo por categoría (según el orden del total) para que coincida en los tres donuts.
  const householdCats = byCategory(monthTx);
  const colorOf = new Map(householdCats.map(([n], i) => [n, COLORS[i % COLORS.length]]));
  const slices = (cats: [string, bigint][]): Slice[] => cats.map(([name, v]) => ({ name, value: Number(v) / 100, color: colorOf.get(name) ?? COLORS[0] }));

  // Un bloque por miembro: primero yo, después cada uno de los demás. La suma de todos = total del hogar.
  const memberList = members as { id: string; name: string }[];
  const people = [...memberList.filter((x) => x.id === m.id), ...memberList.filter((x) => x.id !== m.id)].map((p) => {
    const mine = monthTx.filter((x) => x.memberId === p.id);
    return { ...p, me: p.id === m.id, inc: sum(mine, "INCOME"), exp: sum(mine, "EXPENSE"), pie: slices(byCategory(mine)) };
  });
  const firstName = (m.name || m.email.split("@")[0]).split(" ")[0];

  return (
    <div>
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted">{m.household.name} · {monthLabel(now, false)}</p>
          <h1 className="truncate text-[28px] font-extrabold leading-tight tracking-tight">Hola, {firstName} <span aria-hidden="true">👋</span></h1>
        </div>
        <Link href="/hogar" aria-label="Ver miembros del hogar"><AvatarStack names={people.map((p) => p.name)} /></Link>
      </header>

      {charged > 0 && <Notice tone="ok">Se registraron {charged} cobro(s) de suscripciones. <Link href="/movimientos" className="font-semibold underline">Ver movimientos</Link></Notice>}

      {members.length < 2 && (
        <div className="card mb-4 border border-mint/60">
          <div className="flex items-center gap-3">
            <IconTile icon="users" tone="green" />
            <div><p className="font-bold">Invitá a tu pareja</p><p className="text-xs text-muted">Que cree su cuenta, elija «Unirme» y use este código</p></div>
          </div>
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-mint-soft p-3">
            <code className="min-w-0 flex-1 select-all truncate font-mono text-sm font-semibold text-primary">{m.household.inviteCode}</code>
            <CopyButton text={m.household.inviteCode} />
          </div>
        </div>
      )}

      <HeroCard>
        <p className="text-sm text-white/70">Saldo total</p>
        <p className="mt-1 text-[40px] font-extrabold leading-none tracking-tight tabular-nums">{fmt(total)}</p>
        <span className={`mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${balance >= 0n ? "bg-mint/20 text-mint" : "bg-[#FDECEE]/20 text-[#FFB3B6]"}`}>
          <Icon name="trend" className="h-3.5 w-3.5" />{balance >= 0n ? "+" : ""}{fmt(balance)} este mes
        </span>
        <dl className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/10 px-3.5 py-2.5"><dt className="text-[11px] text-white/60">Disponible para gastar</dt><dd className="font-bold tabular-nums">{fmt(disponible)}</dd></div>
          <div className="rounded-2xl bg-white/10 px-3.5 py-2.5"><dt className="text-[11px] text-white/60">Ahorrado</dt><dd className="font-bold tabular-nums">{fmt(ahorrado)}</dd></div>
        </dl>
      </HeroCard>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="card">
          <IconTile icon="down" tone="green" size="sm" />
          <p className="mt-4 text-sm text-muted">Ingresos</p>
          <p className="text-xl font-extrabold tracking-tight tabular-nums">{fmt(inc)}</p>
        </div>
        <div className="card">
          <IconTile icon="up" tone="blue" size="sm" />
          <p className="mt-4 text-sm text-muted">Gastos</p>
          <p className="text-xl font-extrabold tracking-tight tabular-nums">{fmt(exp)}</p>
        </div>
      </div>

      <div className="card mt-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold">Gastos del mes vs. ingresos</h2>
          {usedPct !== null && <span className={`text-sm font-bold ${usedPct > 100 ? "text-neg" : usedPct > 85 ? "text-warn" : "text-pos"}`}>{usedPct}%</span>}
        </div>
        {usedPct === null ? (
          <p className="mt-2 text-sm text-muted">Todavía no hay ingresos este mes{exp > 0n ? `; llevan gastado ${fmt(exp)}` : ""}.</p>
        ) : (
          <>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-bg" role="progressbar" aria-valuenow={usedPct} aria-valuemin={0} aria-valuemax={100} aria-label="Porcentaje de ingresos gastado">
              <div className={`h-full rounded-full ${usedPct > 100 ? "bg-neg" : "bg-gradient-to-r from-mint to-pos"}`} style={{ width: `${Math.min(100, usedPct)}%` }} />
            </div>
            <p className="mt-3 text-sm text-muted">Gastado <b className="text-text">{fmt(exp)}</b> / {fmt(inc)}</p>
            <p className="mt-0.5 text-xs text-muted">{balance >= 0n ? `Van bien: les quedan ${fmt(balance)} este mes 🌿` : `Se pasaron ${fmt(-balance)} de lo que entró este mes.`}</p>
          </>
        )}
      </div>
      {(trfCount > 0 || ahorrado > 0n) && (
        <p className="mt-3 px-1 text-xs text-muted">
          {trfCount > 0 && <>Transferencias del mes: {fmt(trf)} en {trfCount} {trfCount === 1 ? "movimiento" : "movimientos"}. </>}
          Las transferencias y lo que apartás o retirás de <Link href="/ahorro" className="underline">ahorro</Link> no cuentan como ingreso ni gasto.
        </p>
      )}

      <SectionHeader title="Últimos movimientos" action={<Link href="/movimientos" className="text-sm font-semibold text-primary">Ver todo</Link>} />
      {recent.length === 0 ? (
        <div className="card text-center text-sm text-muted">Todavía no hay movimientos. <Link href="/movimientos#nuevo" className="font-semibold text-primary">Registrá el primero</Link></div>
      ) : (
        <ul className="card divide-y divide-line py-1">
          {recent.map((t) => <li key={t.id}><MovementRow t={t} when={relDay(t.date, today)} /></li>)}
        </ul>
      )}

      <SectionHeader title="Resumen del hogar · Total" action={<Link href="/resumen" className="text-sm font-semibold text-primary">Por categoría</Link>} />
      <Charts bars={bars} pie={slices(householdCats)} />

      <SectionHeader title="Por miembro" />
      <div className="grid gap-4 md:grid-cols-2">
        {people.map((p) => (
          <div key={p.id} className="card">
            <div className="flex items-center gap-3">
              <Avatar name={p.name} />
              <h3 className="min-w-0 truncate font-bold">{p.me ? `Mis gastos - ${p.name}` : `Gastos de ${p.name}`}</h3>
            </div>
            <dl className="my-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-bg px-3.5 py-2.5"><dt className="text-xs text-muted">Ingresos del mes</dt><dd className="font-bold text-pos tabular-nums">{fmt(p.inc)}</dd></div>
              <div className="rounded-2xl bg-bg px-3.5 py-2.5"><dt className="text-xs text-muted">Gastos del mes</dt><dd className="font-bold text-neg tabular-nums">{fmt(p.exp)}</dd></div>
            </dl>
            <CategoryDonut pie={p.pie} height="h-48" empty={p.me ? "No registraste gastos este mes." : `${p.name} no registró gastos este mes.`} />
          </div>
        ))}
      </div>
    </div>
  );
}
