import Link from "next/link";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { money } from "@/lib/currency";
import { fdate } from "@/lib/util";
import { Empty, Icon, IconTile, Notice, PageHeader } from "@/components/ui";
import Amt from "@/components/Amt";

/** Lista de divisiones de gastos (viajes, asados...). Cada una es independiente y no toca los movimientos del hogar. */
export default async function Divisiones({ searchParams: sp }: { searchParams: { ok?: string } }) {
  const m = await requireMember();
  const [groups, totals] = await Promise.all([
    db.splitGroup.findMany({ where: { householdId: m.householdId }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], select: { id: true, title: true, currency: true, status: true, createdAt: true, _count: { select: { participants: true, expenses: true } } } }),
    db.splitExpense.groupBy({ by: ["groupId"], where: { householdId: m.householdId }, _sum: { amount: true } }),
  ]);
  const totalOf = new Map(totals.map((t) => [t.groupId, t._sum.amount ?? 0n]));

  return (
    <div>
      <PageHeader title="División de gastos" back={{ href: "/hogar", label: "Hogar" }} right={
        <Link href="/hogar/division/nueva" className="btn px-4 py-2.5 text-sm"><Icon name="plus" className="h-4 w-4" />Nueva división</Link>
      } />
      {sp.ok === "borrada" && <Notice>División borrada.</Notice>}
      <p className="mb-4 px-1 text-sm text-muted">Para un viaje, un asado o un alquiler con amigos: anotá quién pagó qué y la app calcula quién le debe a quién. No se mezcla con los movimientos del hogar.</p>
      {groups.length === 0 ? (
        <Empty icon="split">Todavía no hay divisiones. <Link href="/hogar/division/nueva" className="font-semibold text-primary">Creá la primera</Link></Empty>
      ) : (
        <ul className="card divide-y divide-line py-1">
          {groups.map((g) => (
            <li key={g.id}>
              <Link href={`/hogar/division/${g.id}`} className="flex items-center gap-3.5 py-3.5">
                <IconTile icon="split" tone={g.status === "SETTLED" ? "gray" : "violet"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{g.title}</span>
                  <span className="text-xs text-muted">{g._count.participants} personas · {g._count.expenses} {g._count.expenses === 1 ? "gasto" : "gastos"} · {fdate(g.createdAt)}</span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <span className="font-bold tabular-nums"><Amt c={g.currency}>{money(totalOf.get(g.id) ?? 0n, g.currency)}</Amt></span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${g.status === "SETTLED" ? "bg-bg text-muted" : "bg-mint-soft text-pos"}`}>{g.status === "SETTLED" ? "Saldado" : "Activo"}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
