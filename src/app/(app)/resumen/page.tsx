import Link from "next/link";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { fmt, todayAR } from "@/lib/util";
import { categoryVisual, monthLabel } from "@/lib/visuals";
import { COLORS, type Slice } from "@/lib/chart-colors";
import { currencyName, money } from "@/lib/currency";
import { CategoryDonut, MonthlyBars } from "@/components/Charts";
import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import { Avatar, Empty, Icon, IconTile, PageHeader, SectionHeader } from "@/components/ui";
import Amt from "@/components/Amt";

const shift = (ym: string, n: number) => { const d = new Date(ym + "-01T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
const start = (ym: string) => new Date(ym + "-01T00:00:00Z");
const desc = (a: [string, bigint], b: [string, bigint]) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0);

type Search = { mes?: string; tipo?: string; quien?: string; cat?: string };

/**
 * Resumen con todos los gráficos (cuentas en ARS, sin transferencias ni anulados):
 * por categoría, ingresos vs. gastos de 6 meses y por miembro. Filtros: mes, gastos/ingresos, miembro y categoría.
 */
export default async function Resumen({ searchParams: sp }: { searchParams: Search }) {
  const m = await requireMember();
  const hid = m.householdId;
  const current = todayAR().slice(0, 7);
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") && sp.mes! <= current ? sp.mes! : current;
  const income = sp.tipo === "ingresos";
  const type = income ? "INCOME" : "EXPENSE";
  const prev = shift(mes, -1);
  const keys = Array.from({ length: 6 }, (_, i) => shift(mes, i - 5)); // 6 meses que terminan en el elegido

  const [members, categories] = await Promise.all([
    db.member.findMany({ where: { householdId: hid }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.category.findMany({ where: { householdId: hid }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  // Filtros: solo se aceptan valores de este hogar.
  const quien = members.some((x) => x.id === sp.quien) ? sp.quien : undefined;
  const cat = categories.some((x) => x.id === sp.cat) ? sp.cat : undefined;

  const [rows, foreignTx] = await Promise.all([
    db.transaction.findMany({
      where: { householdId: hid, voidedAt: null, type: { in: ["INCOME", "EXPENSE"] }, account: { currency: "ARS" }, date: { gte: start(keys[0]), lt: start(shift(mes, 1)) }, ...(quien ? { memberId: quien } : {}), ...(cat ? { categoryId: cat } : {}) },
      select: { type: true, amount: true, date: true, memberId: true, category: { select: { name: true } } },
    }),
    // Ingresos y gastos del mes en otras monedas: se muestran aparte, cada uno en su moneda.
    db.transaction.findMany({
      where: { householdId: hid, voidedAt: null, type: { in: ["INCOME", "EXPENSE"] }, account: { currency: { not: "ARS" } }, date: { gte: start(mes), lt: start(shift(mes, 1)) }, ...(quien ? { memberId: quien } : {}), ...(cat ? { categoryId: cat } : {}) },
      select: { type: true, amount: true, account: { select: { currency: true } } },
    }),
  ]);
  type Row = (typeof rows)[number];
  const inMonth = (k: string) => (r: Row) => r.date.toISOString().startsWith(k);
  const sum = (list: Row[], t: string) => list.filter((r) => r.type === t).reduce((a, r) => a + r.amount, 0n);
  const mesRows = rows.filter(inMonth(mes));
  const typed = mesRows.filter((r) => r.type === type);

  // Por categoría (del tipo elegido) y comparación con el mes anterior.
  const total = sum(mesRows, type);
  const prevTotal = sum(rows.filter(inMonth(prev)), type);
  const byCategory = (list: Row[]) => {
    const map = new Map<string, bigint>();
    list.forEach((r) => { const n = r.category?.name ?? "Sin categoría"; map.set(n, (map.get(n) ?? 0n) + r.amount); });
    return [...map].sort(desc);
  };
  const householdCats = byCategory(typed);
  // Color fijo por categoría (según el orden del total) para que coincida en todos los donuts.
  const colorOf = new Map(householdCats.map(([n], i) => [n, COLORS[i % COLORS.length]]));
  const slices = (cats: [string, bigint][]): (Slice & { cents: bigint })[] => cats.map(([name, v]) => ({ name, cents: v, value: Number(v) / 100, color: colorOf.get(name) ?? COLORS[0] }));
  const cats = slices(householdCats);
  const diff = prevTotal > 0n ? Math.round(Number(((total - prevTotal) * 1000n) / prevTotal) / 10) : null;
  const better = diff !== null && (income ? diff >= 0 : diff <= 0);

  // Ingresos vs. gastos por mes.
  const bars = keys.map((k) => { const l = rows.filter(inMonth(k)); return { mes: k.slice(5) + "/" + k.slice(2, 4), Ingresos: Number(sum(l, "INCOME")) / 100, Gastos: Number(sum(l, "EXPENSE")) / 100 }; });

  // Por miembro: primero yo, después los demás (o solo el miembro filtrado).
  const people = [...members.filter((x) => x.id === m.id), ...members.filter((x) => x.id !== m.id)]
    .filter((p) => !quien || p.id === quien)
    .map((p) => {
      const mine = mesRows.filter((r) => r.memberId === p.id);
      return { ...p, me: p.id === m.id, inc: sum(mine, "INCOME"), exp: sum(mine, "EXPENSE"), pie: slices(byCategory(mine.filter((r) => r.type === type))) };
    });
  const shareOf = (p: (typeof people)[number]) => (income ? p.inc : p.exp);

  const foreign = new Map<string, { inc: bigint; exp: bigint }>();
  foreignTx.forEach((x) => { const e = foreign.get(x.account.currency) ?? { inc: 0n, exp: 0n }; if (x.type === "INCOME") e.inc += x.amount; else e.exp += x.amount; foreign.set(x.account.currency, e); });

  const base = { ...(mes !== current ? { mes } : {}), ...(income ? { tipo: "ingresos" } : {}), ...(quien ? { quien } : {}), ...(cat ? { cat } : {}) };
  const q = (p: Record<string, string>) => "/resumen?" + new URLSearchParams({ ...base, ...p }).toString();
  const word = income ? "ingresos" : "gastos";
  const filtered = !!(quien || cat);

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

      <form method="get" action="/resumen" className="mt-3 grid grid-cols-2 gap-2" aria-label="Filtros del resumen">
        {mes !== current && <input type="hidden" name="mes" value={mes} />}
        {income && <input type="hidden" name="tipo" value="ingresos" />}
        <AutoSubmitSelect name="quien" defaultValue={quien ?? ""} aria-label="Miembro" className="input !py-2.5">
          <option value="">Todos los miembros</option>
          {[...members.filter((x) => x.id === m.id), ...members.filter((x) => x.id !== m.id)].map((p) => <option key={p.id} value={p.id}>{p.id === m.id ? `${p.name} (yo)` : p.name}</option>)}
        </AutoSubmitSelect>
        <AutoSubmitSelect name="cat" defaultValue={cat ?? ""} aria-label="Categoría" className="input !py-2.5">
          <option value="">Todas las categorías</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </AutoSubmitSelect>
        <noscript><button className="btn col-span-2">Aplicar filtros</button></noscript>
      </form>
      {filtered && (
        <p className="mt-2 px-1 text-xs text-muted">
          Filtrado{quien ? ` por ${members.find((x) => x.id === quien)?.name}` : ""}{cat ? `${quien ? " y" : " por"} ${categories.find((x) => x.id === cat)?.name}` : ""}.{" "}
          <Link href={"/resumen?" + new URLSearchParams({ ...(mes !== current ? { mes } : {}), ...(income ? { tipo: "ingresos" } : {}) })} className="font-semibold text-primary">Quitar filtros</Link>
        </p>
      )}

      <SectionHeader title={`${income ? "Ingresos" : "Gastos"} por categoría`} />
      {cats.length === 0 ? (
        <Empty icon="pie">No hay {word} en {monthLabel(mes)}{filtered ? " con esos filtros" : ""}.</Empty>
      ) : (
        <div className="card">
          <CategoryDonut pie={cats} height="h-60" centerLabel={income ? "Total ingresado" : "Total gastado"} empty="" />
          {diff !== null && (
            <p className={`mt-4 rounded-full px-4 py-2 text-center text-sm font-medium ${better ? "bg-mint-soft text-pos" : "bg-[#FDECEE] text-neg dark:bg-neg/15"}`}>
              {income ? "Ingresaron" : "Gastaron"} {Math.abs(diff)}% {diff <= 0 ? "menos" : "más"} que en {monthLabel(prev, false).toLowerCase()}
            </p>
          )}
        </div>
      )}

      <SectionHeader title="Ingresos y gastos · 6 meses" />
      <div className="card"><MonthlyBars bars={bars} /></div>

      <SectionHeader title={`${income ? "Ingresos" : "Gastos"} por miembro`} />
      {people.length > 1 && total > 0n && (
        <div className="card mb-4">
          <div className="flex h-3 overflow-hidden rounded-full bg-bg" aria-hidden="true">
            {people.map((p, i) => <div key={p.id} style={{ width: `${Number((shareOf(p) * 1000n) / total) / 10}%`, background: COLORS[i % COLORS.length] }} />)}
          </div>
          <ul className="mt-3 space-y-1.5">
            {people.map((p, i) => (
              <li key={p.id} className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="text-muted">{Number((shareOf(p) * 100n) / total)}%</span>
                <b className="w-28 text-right tabular-nums"><Amt>{fmt(shareOf(p))}</Amt></b>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {people.map((p) => (
          <div key={p.id} className="card">
            <div className="flex items-center gap-3">
              <Avatar name={p.name} />
              <h3 className="min-w-0 truncate font-bold">{p.me ? `Mis ${word} - ${p.name}` : `${income ? "Ingresos" : "Gastos"} de ${p.name}`}</h3>
            </div>
            <dl className="my-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-bg px-3.5 py-2.5"><dt className="text-xs text-muted">Ingresos del mes</dt><dd className="font-bold text-pos tabular-nums"><Amt>{fmt(p.inc)}</Amt></dd></div>
              <div className="rounded-2xl bg-bg px-3.5 py-2.5"><dt className="text-xs text-muted">Gastos del mes</dt><dd className="font-bold text-neg tabular-nums"><Amt>{fmt(p.exp)}</Amt></dd></div>
            </dl>
            <CategoryDonut pie={p.pie} height="h-48" centerLabel={income ? "Total ingresado" : "Total gastado"} empty={p.me ? `No registraste ${word} en ${monthLabel(mes, false).toLowerCase()}.` : `${p.name} no registró ${word} en ${monthLabel(mes, false).toLowerCase()}.`} />
          </div>
        ))}
      </div>

      {cats.length > 0 && (
        <>
          <SectionHeader title="Detalle por categoría" />
          <ul className="card divide-y divide-line py-1">
            {cats.map((c) => {
              const pct = total > 0n ? Number((c.cents * 100n) / total) : 0;
              const v = categoryVisual(c.name, type);
              return (
                <li key={c.name} className="py-4">
                  <div className="flex items-center gap-3">
                    <IconTile icon={v.icon} tone={v.tone} />
                    <span className="min-w-0 flex-1 truncate font-semibold">{c.name}</span>
                    <span className="text-right"><b className="block tabular-nums"><Amt>{fmt(c.cents)}</Amt></b><span className="text-xs text-muted">{pct}%</span></span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.color }} /></div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <p className="mt-4 px-1 text-xs text-muted">
        Las transferencias y lo que apartás o retirás de <Link href="/ahorro" className="underline">ahorro</Link> no cuentan como ingreso ni gasto.
        {foreign.size > 0 && <> En otras monedas en {monthLabel(mes, false).toLowerCase()}:{" "}
          {[...foreign].map(([c, v], i) => <span key={c}>{i > 0 && " · "}{currencyName(c)} +<Amt c={c}>{money(v.inc, c)}</Amt> / -<Amt c={c}>{money(v.exp, c)}</Amt></span>)}.</>}
      </p>
    </div>
  );
}
