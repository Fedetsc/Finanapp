import Link from "next/link";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { fmt, todayAR } from "@/lib/util";
import { processDueSubscriptions, refreshInstallments } from "@/lib/billing";
import { accountBalances } from "@/lib/balances";
import Charts, { CategoryDonut, COLORS, type Slice } from "@/components/Charts";

const Stat = ({ l, v, c, hint }: { l: string; v: string; c?: string; hint?: string }) => (
  <div className="card">
    <p className="text-xs text-muted">{l}</p>
    <p className={`mt-1 text-xl font-semibold ${c ?? ""}`}>{v}</p>
    {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
  </div>
);

type Tx = { type: string; amount: bigint; memberId: string; date: Date; category: { name: string } | null };

export default async function Home() {
  const m = await requireMember();
  const hid = m.householdId;
  // Cobros automáticos: las suscripciones vencidas se registran como gasto al entrar al resumen.
  // Las compras con tarjeta no son movimientos: solo cuentan cuando se paga cada cuota.
  const [charged] = await Promise.all([processDueSubscriptions(hid), refreshInstallments(hid)]);

  const now = todayAR().slice(0, 7); // mes actual: mismo filtro para el bloque total y los de cada miembro
  const keys = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now + "-01T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() - (5 - i));
    return d.toISOString().slice(0, 7);
  });
  const [txs, balances, vaults, members, awaiting] = await Promise.all([
    db.transaction.findMany({ where: { householdId: hid, voidedAt: null, date: { gte: new Date(keys[0] + "-01T00:00:00Z") } }, select: { type: true, amount: true, memberId: true, date: true, category: { select: { name: true } } } }),
    accountBalances(hid),
    db.savingsVault.aggregate({ where: { householdId: hid }, _sum: { currentAmount: true } }),
    db.member.findMany({ where: { householdId: hid }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.installment.count({ where: { status: "AWAITING_CONFIRMATION", purchase: { householdId: hid, status: "ACTIVE", card: { ownerMemberId: m.id } } } }),
  ]);

  // Disponible = suma de los saldos de todas las cuentas (ya descuentan lo apartado y suman lo retirado).
  // Ahorrado = suma de los sobres. Saldo total = Disponible + Ahorrado: apartar no cambia el total.
  const disponible = [...balances.values()].reduce((a, b) => a + b, 0n);
  const ahorrado = vaults._sum.currentAmount ?? 0n;
  const total = disponible + ahorrado;

  // Ingresos/gastos solo leen Transaction INCOME/EXPENSE: transferencias y ahorro quedan afuera.
  const inMonth = (k: string) => (x: Tx) => x.date.toISOString().startsWith(k);
  const sum = (list: Tx[], t: string) => list.filter((x) => x.type === t).reduce((a, x) => a + x.amount, 0n);
  const monthTx = txs.filter(inMonth(now));
  const bars = keys.map((k) => { const l = txs.filter(inMonth(k)); return { mes: k.slice(5) + "/" + k.slice(2, 4), Ingresos: Number(sum(l, "INCOME")) / 100, Gastos: Number(sum(l, "EXPENSE")) / 100 }; });
  const inc = sum(monthTx, "INCOME"), exp = sum(monthTx, "EXPENSE"), trf = sum(monthTx, "TRANSFER");
  const trfCount = monthTx.filter((x) => x.type === "TRANSFER").length;

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
  const people = [...members.filter((x) => x.id === m.id), ...members.filter((x) => x.id !== m.id)].map((p) => {
    const mine = monthTx.filter((x) => x.memberId === p.id);
    return { ...p, me: p.id === m.id, inc: sum(mine, "INCOME"), exp: sum(mine, "EXPENSE"), pie: slices(byCategory(mine)) };
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Resumen del mes</h1>
      {charged > 0 && <p className="rounded-lg border border-line bg-surface p-3 text-sm">Se registraron {charged} cobro(s) de suscripciones. <Link href="/movimientos" className="text-primary underline">Ver movimientos</Link></p>}
      {awaiting > 0 && <p className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm">Tenés {awaiting} cuota(s) de tarjeta esperando confirmación de pago. <Link href="/tarjetas" className="text-primary underline">Ir a tarjetas</Link></p>}
      {members.length < 2 && (
        <div className="card">
          <p className="text-sm font-medium">Invitá a tu pareja</p>
          <p className="mt-1 text-xs text-muted">Que cree su cuenta, elija «Unirme con un código» y use este código:</p>
          <p className="mt-2 select-all break-all rounded-lg bg-bg p-2 font-mono text-sm">{m.household.inviteCode}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat l="Saldo total del hogar" v={fmt(total)} hint="Cuentas + ahorro" />
        <Stat l="Ahorrado" v={fmt(ahorrado)} c="text-primary" hint={ahorrado > 0n ? "Apartado, no disponible" : undefined} />
        <Stat l="Disponible" v={fmt(disponible)} c={disponible < 0n ? "text-neg" : ""} hint="Para gastar" />
        <Stat l="Ingresos del mes (hogar)" v={fmt(inc)} c="text-pos" />
        <Stat l="Gastos del mes (hogar)" v={fmt(exp)} c="text-neg" />
        <Stat l="Balance mensual (hogar)" v={fmt(inc - exp)} c={inc >= exp ? "text-pos" : "text-neg"} />
      </div>
      {(trfCount > 0 || ahorrado > 0n) && (
        <p className="text-xs text-muted">
          {trfCount > 0 && <>Transferencias del mes: {fmt(trf)} en {trfCount} {trfCount === 1 ? "movimiento" : "movimientos"}. </>}
          Las transferencias y lo que apartás o retirás de <Link href="/ahorro" className="underline">ahorro</Link> no cuentan como ingreso ni gasto.
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Resumen del hogar - Total</h2>
        <Charts bars={bars} pie={slices(householdCats)} />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Por miembro</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {people.map((p) => (
            <div key={p.id} className="card">
              <h3 className="text-sm font-medium">{p.me ? `Mis gastos - ${p.name}` : `Gastos de ${p.name}`}</h3>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div><dt className="text-xs text-muted">Ingresos del mes</dt><dd className="font-semibold text-pos">{fmt(p.inc)}</dd></div>
                <div><dt className="text-xs text-muted">Gastos del mes</dt><dd className="font-semibold text-neg">{fmt(p.exp)}</dd></div>
              </dl>
              <CategoryDonut pie={p.pie} height="h-56" empty={p.me ? "No registraste gastos este mes." : `${p.name} no registró gastos este mes.`} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
