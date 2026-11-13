import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { fmt, todayAR } from "@/lib/util";
import Charts from "@/components/Charts";

const Stat = ({ l, v, c }: { l: string; v: string; c?: string }) => (
  <div className="card"><p className="text-xs text-muted">{l}</p><p className={`mt-1 text-xl font-semibold ${c ?? ""}`}>{v}</p></div>
);

export default async function Home() {
  const m = await requireMember();
  const hid = m.householdId;
  const inviteCode = m.household.inviteCode;
  const now = todayAR().slice(0, 7);
  const keys = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now + "-01T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() - (5 - i));
    return d.toISOString().slice(0, 7);
  });
  const [txs, opening, totals, members] = await Promise.all([
    db.transaction.findMany({ where: { householdId: hid, voidedAt: null, date: { gte: new Date(keys[0] + "-01T00:00:00Z") } }, include: { category: true } }),
    db.account.aggregate({ where: { householdId: hid }, _sum: { openingBalance: true } }),
    db.transaction.groupBy({ by: ["type"], where: { householdId: hid, voidedAt: null }, _sum: { amount: true } }),
    db.member.count({ where: { householdId: hid } }),
  ]);
  const all = (t: string) => totals.find((x) => x.type === t)?._sum.amount ?? 0n;
  // Las transferencias (TRANSFER) son internas al hogar: no cambian el saldo total ni cuentan como ingreso/gasto.
  const total = (opening._sum.openingBalance ?? 0n) + all("INCOME") - all("EXPENSE");
  const month = (k: string, t: string) => txs.filter((x) => x.type === t && x.date.toISOString().startsWith(k)).reduce((a, x) => a + x.amount, 0n);
  const bars = keys.map((k) => ({ mes: k.slice(5) + "/" + k.slice(2, 4), Ingresos: Number(month(k, "INCOME")) / 100, Gastos: Number(month(k, "EXPENSE")) / 100 }));
  const inc = month(now, "INCOME"), exp = month(now, "EXPENSE"), trf = month(now, "TRANSFER");
  const trfCount = txs.filter((x) => x.type === "TRANSFER" && x.date.toISOString().startsWith(now)).length;
  const byCat = new Map<string, number>();
  txs.filter((x) => x.type === "EXPENSE" && x.date.toISOString().startsWith(now)).forEach((x) => {
    const name = x.category?.name ?? "Sin categoría";
    byCat.set(name, (byCat.get(name) ?? 0) + Number(x.amount) / 100);
  });
  const pie = [...byCat].map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Resumen del mes</h1>
      {members < 2 && (
        <div className="card">
          <p className="text-sm font-medium">Invitá a tu pareja</p>
          <p className="mt-1 text-xs text-muted">Que cree su cuenta, elija «Unirme con un código» y use este código:</p>
          <p className="mt-2 select-all break-all rounded-lg bg-bg p-2 font-mono text-sm">{inviteCode}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat l="Saldo total" v={fmt(total)} />
        <Stat l="Ingresos del mes" v={fmt(inc)} c="text-pos" />
        <Stat l="Gastos del mes" v={fmt(exp)} c="text-neg" />
        <Stat l="Balance mensual" v={fmt(inc - exp)} c={inc >= exp ? "text-pos" : "text-neg"} />
      </div>
      {trfCount > 0 && (
        <p className="text-xs text-muted">
          Transferencias del mes: {fmt(trf)} en {trfCount} {trfCount === 1 ? "movimiento" : "movimientos"}. No cuentan como ingreso ni gasto.
        </p>
      )}
      <Charts bars={bars} pie={pie} />
    </div>
  );
}
