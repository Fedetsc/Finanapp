import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { todayAR } from "@/lib/util";
import { relDay } from "@/lib/visuals";
import { today } from "@/lib/billing";
import { accrueYields } from "@/lib/yields";
import MovementRow from "@/components/MovementRow";
import SubmitButton from "@/components/SubmitButton";
import { Empty, Icon, Notice, PageHeader } from "@/components/ui";
import Err from "@/components/Err";

async function voidTx(fd: FormData) {
  "use server";
  const m = await requireMember();
  const id = String(fd.get("id"));
  await db.$transaction(async (tx) => {
    // Solo quien registró el movimiento puede anularlo (no se anulan movimientos de otro miembro).
    const r = await tx.transaction.updateMany({ where: { id, householdId: m.householdId, memberId: m.id, voidedAt: null }, data: { voidedAt: new Date() } });
    // Solo auditar si realmente se anuló un movimiento propio de este hogar.
    if (r.count !== 1) return;
    await tx.auditLog.create({ data: { householdId: m.householdId, userId: m.userId, action: "VOID", entity: "Transaction", entityId: id } });
    // Si era el pago de una cuota de tarjeta, la cuota vuelve a quedar impaga.
    const t = await tx.transaction.findUniqueOrThrow({ where: { id }, include: { installment: true } });
    if (t.installment) {
      const i = t.installment;
      await tx.transaction.update({ where: { id }, data: { installmentId: null } });
      await tx.installment.update({ where: { id: i.id }, data: { status: i.closingDate < today() ? "AWAITING_CONFIRMATION" : "PENDING", paidWithAccountId: null, paidAt: null } });
      await tx.creditCardPurchase.update({ where: { id: i.purchaseId }, data: { installmentsPaid: { decrement: 1 }, status: "ACTIVE" } });
    }
  });
  revalidatePath("/", "layout");
}

const TYPES = { EXPENSE: "Gasto", INCOME: "Ingreso", TRANSFER: "Transferencia", YIELD: "Rendimiento" } as const;
const PAGE = 30; // movimientos por tanda ("Ver más" suma otra tanda)
const MAX = 600;
const isoDate = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

type Search = { e?: string; ok?: string; q?: string; quien?: string; cuenta?: string; cat?: string; tipo?: string; desde?: string; hasta?: string; n?: string };

/** Lista de movimientos del hogar con búsqueda y filtros. El formulario para cargar uno vive en /movimientos/nuevo. */
export default async function Movimientos({ searchParams: sp }: { searchParams: Search }) {
  const m = await requireMember();
  await accrueYields(m.householdId); // rendimientos pendientes (por si el cron no corrió)
  const where = { householdId: m.householdId };
  const [accounts, categories, members] = await Promise.all([
    db.account.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true, ownerMemberId: true, owner: { select: { name: true } } } }),
    db.category.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.member.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  // Filtros: solo se aceptan valores de este hogar.
  const q = (sp.q ?? "").trim().slice(0, 80);
  const quien = members.some((x) => x.id === sp.quien) ? sp.quien : undefined;
  const cuenta = accounts.some((x) => x.id === sp.cuenta) ? sp.cuenta : undefined;
  const cat = categories.some((x) => x.id === sp.cat) ? sp.cat : undefined;
  const tipo = sp.tipo && sp.tipo in TYPES ? (sp.tipo as keyof typeof TYPES) : undefined;
  const desde = isoDate(sp.desde);
  const hasta = isoDate(sp.hasta);
  const n = Math.min(MAX, Math.max(PAGE, Math.floor(Number(sp.n) / PAGE) * PAGE || PAGE));

  // Misma consulta que usaba la card "Últimos movimientos" de Inicio, con filtros y paginación.
  const filter: Prisma.TransactionWhereInput = {
    householdId: m.householdId,
    voidedAt: null,
    ...(quien ? { memberId: quien } : {}),
    ...(cuenta ? { OR: [{ accountId: cuenta }, { toAccountId: cuenta }] } : {}),
    ...(cat ? { categoryId: cat } : {}),
    ...(tipo ? { type: tipo } : {}),
    ...(desde || hasta ? { date: { ...(desde ? { gte: new Date(desde + "T00:00:00Z") } : {}), ...(hasta ? { lte: new Date(hasta + "T00:00:00Z") } : {}) } } : {}),
    ...(q ? { AND: [{ OR: [{ description: { contains: q, mode: "insensitive" } }, { category: { name: { contains: q, mode: "insensitive" } } }] }] } : {}),
  };
  const rows = await db.transaction.findMany({
    where: filter,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: n + 1,
    include: { category: { select: { name: true } }, account: { select: { name: true, currency: true } }, toAccount: { select: { name: true, currency: true } }, member: { select: { name: true } } },
  });
  const more = rows.length > n;
  const txs = more ? rows.slice(0, n) : rows;

  const todayIso = todayAR();
  const active = [q, quien, cuenta, cat, tipo, desde, hasta].filter(Boolean).length;
  const kept = Object.entries({ q, quien, cuenta, cat, tipo, desde, hasta }).filter((e): e is [string, string] => !!e[1]);
  const moreHref = `/movimientos?${new URLSearchParams([...kept, ["n", String(n + PAGE)]])}`;
  const people = [...members.filter((x) => x.id === m.id), ...members.filter((x) => x.id !== m.id)];

  return (
    <div className="space-y-4">
      <PageHeader title="Movimientos" subtitle={m.household.name} right={<Link href="/movimientos/nuevo" className="pill"><Icon name="plus" className="h-4 w-4" />Nuevo</Link>} />
      <Err e={sp.e} />
      {sp.ok && <Notice tone="ok">Movimiento guardado.</Notice>}

      <form method="get" action="/movimientos" role="search" className="card space-y-3">
        <label className="relative block">
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input name="q" type="search" defaultValue={q} maxLength={80} placeholder="Buscar por descripción" aria-label="Buscar por descripción" className="input pl-10" />
        </label>
        <details className="group" open={active > (q ? 1 : 0)}>
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-muted [&::-webkit-details-marker]:hidden">
            <span>Filtros{active > 0 ? ` (${active})` : ""}</span>
            <Icon name="chevronDown" className="h-4 w-4 transition group-open:rotate-180" />
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <select name="quien" defaultValue={quien ?? ""} aria-label="Miembro" className="input">
              <option value="">Todos los miembros</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.id === m.id ? `${p.name} (yo)` : p.name}</option>)}
            </select>
            <select name="cuenta" defaultValue={cuenta ?? ""} aria-label="Cuenta" className="input">
              <option value="">Todas las cuentas</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.ownerMemberId === m.id ? a.name : `${a.name} · ${a.owner.name}`}</option>)}
            </select>
            <select name="cat" defaultValue={cat ?? ""} aria-label="Categoría" className="input">
              <option value="">Todas las categorías</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select name="tipo" defaultValue={tipo ?? ""} aria-label="Tipo" className="input">
              <option value="">Todos los tipos</option>
              {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <label className="text-xs text-muted">Desde<input name="desde" type="date" defaultValue={desde} className="input mt-1" /></label>
            <label className="text-xs text-muted">Hasta<input name="hasta" type="date" defaultValue={hasta} className="input mt-1" /></label>
          </div>
        </details>
        <div className="flex gap-2">
          <button className="btn flex-1">Buscar</button>
          {active > 0 && <Link href="/movimientos" className="pill shrink-0 justify-center px-4">Limpiar</Link>}
        </div>
      </form>

      {txs.length === 0 ? (
        <Empty>{active > 0 ? "No hay movimientos con esos filtros." : <>Todavía no hay movimientos. <Link href="/movimientos/nuevo" className="font-semibold text-primary">Registrá el primero</Link></>}</Empty>
      ) : (
        <ul className="card divide-y divide-line py-1">
          {txs.map((t) => (
            <li key={t.id}>
              <MovementRow t={t} when={relDay(t.date, todayIso)} action={t.memberId === m.id ? (
                <form action={voidTx}><input type="hidden" name="id" value={t.id} /><SubmitButton className="text-[11px] font-medium text-muted hover:text-neg" pendingText="...">Anular</SubmitButton></form>
              ) : undefined} />
            </li>
          ))}
        </ul>
      )}
      {more && n < MAX && <Link href={moreHref} scroll={false} className="pill w-full justify-center">Ver más</Link>}
    </div>
  );
}
