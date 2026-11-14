import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { fail } from "@/lib/action";
import Link from "next/link";
import { fmt, parseDate, toCents, todayAR } from "@/lib/util";
import { relDay } from "@/lib/visuals";
import MovementRow from "@/components/MovementRow";
import { Avatar, Empty, Icon, Notice, PageHeader } from "@/components/ui";
import Err from "@/components/Err";
import MovementForm from "@/components/MovementForm";
import { today } from "@/lib/billing";

const base = { amount: z.string(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), accountId: z.string().min(1), description: z.string().trim().max(120) };
const Form = z.discriminatedUnion("type", [
  z.object({ type: z.enum(["INCOME", "EXPENSE"]), categoryId: z.string().min(1), ...base }),
  z.object({ type: z.literal("TRANSFER"), toAccountId: z.string().min(1), ...base }),
]);

async function add(fd: FormData) {
  "use server";
  const m = await requireMember();
  try {
    const f = Form.parse(Object.fromEntries(fd));
    const amount = toCents(f.amount);
    if (amount <= 0n) throw new Error("El importe debe ser mayor a cero");
    const date = parseDate(f.date);

    // Cuenta del gasto/ingreso u origen de la transferencia: tiene que ser mía.
    const acc = await db.account.findUnique({ where: { id: f.accountId } });
    if (!acc || acc.householdId !== m.householdId) throw new Error("Elegí una cuenta válida");
    if (acc.ownerMemberId !== m.id) throw new Error("No podés usar la cuenta de otro miembro");

    let data: { categoryId: string; toAccountId?: never } | { toAccountId: string; categoryId?: never };
    let description = f.description;
    if (f.type === "TRANSFER") {
      // Destino: cualquier cuenta del hogar (también la del otro miembro), distinta del origen.
      const to = await db.account.findUnique({ where: { id: f.toAccountId } });
      if (!to || to.householdId !== m.householdId) throw new Error("Elegí una cuenta de destino válida");
      if (to.id === acc.id) throw new Error("La cuenta de origen y la de destino tienen que ser distintas");
      data = { toAccountId: to.id };
      description ||= "Transferencia";
    } else {
      const cat = await db.category.findFirst({ where: { id: f.categoryId, householdId: m.householdId } });
      if (!cat) throw new Error("Elegí una categoría");
      data = { categoryId: cat.id };
    }

    await db.$transaction(async (tx) => {
      const t = await tx.transaction.create({ data: { householdId: m.householdId, memberId: m.id, accountId: acc.id, type: f.type, amount, date, description, ...data } });
      await tx.auditLog.create({ data: { householdId: m.householdId, userId: m.userId, action: "CREATE", entity: f.type === "TRANSFER" ? "Transfer" : "Transaction", entityId: t.id } });
    });
  } catch (e) { fail("/movimientos", e); }
  revalidatePath("/", "layout");
  redirect(`/movimientos?ok=${Date.now()}`);
}

async function voidTx(fd: FormData) {
  "use server";
  const m = await requireMember();
  const id = String(fd.get("id"));
  await db.$transaction(async (tx) => {
    const r = await tx.transaction.updateMany({ where: { id, householdId: m.householdId, voidedAt: null }, data: { voidedAt: new Date() } });
    // Solo auditar si realmente se anuló un movimiento de este hogar.
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

export default async function Movimientos({ searchParams }: { searchParams: { e?: string; ok?: string; quien?: string } }) {
  const m = await requireMember();
  const where = { householdId: m.householdId };
  const [accounts, categories, members] = await Promise.all([
    db.account.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true, ownerMemberId: true, owner: { select: { name: true } } } }),
    db.category.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.member.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  // Filtro por miembro (pills): solo de los miembros de este hogar.
  const quien = members.some((x) => x.id === searchParams.quien) ? searchParams.quien : undefined;
  const txs = await db.transaction.findMany({ where: { ...where, ...(quien ? { memberId: quien } : {}) }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 50, include: { category: true, account: true, toAccount: true, member: true } });
  const mine = accounts.filter((a) => a.ownerMemberId === m.id).map(({ id, name }) => ({ id, name }));
  const byOwner = new Map<string, { id: string; name: string }[]>();
  accounts.filter((a) => a.ownerMemberId !== m.id).forEach((a) => byOwner.set(a.owner.name, [...(byOwner.get(a.owner.name) ?? []), { id: a.id, name: a.name }]));
  const others = [...byOwner].map(([owner, accounts]) => ({ owner, accounts }));

  // Agrupado por día ("Hoy", "Ayer", "12 nov") con el neto del día (sin transferencias ni anulados).
  const todayIso = todayAR();
  const groups: { label: string; net: bigint; items: typeof txs }[] = [];
  for (const t of txs) {
    const label = relDay(t.date, todayIso);
    let g = groups[groups.length - 1];
    if (!g || g.label !== label) groups.push((g = { label, net: 0n, items: [] }));
    g.items.push(t);
    if (!t.voidedAt && t.type !== "TRANSFER") g.net += t.type === "INCOME" ? t.amount : -t.amount;
  }
  const people = [...members.filter((x) => x.id === m.id), ...members.filter((x) => x.id !== m.id)];

  return (
    <div>
      <PageHeader title="Movimientos" subtitle={m.household.name} right={<Link href="#nuevo" className="pill"><Icon name="plus" className="h-4 w-4" />Nuevo</Link>} />
      <Err e={searchParams.e} />
      {searchParams.ok && <Notice tone="ok">Movimiento guardado.</Notice>}

      {mine.length === 0 ? (
        <div id="nuevo" className="card text-center text-sm text-muted">Para registrar movimientos, primero <Link href="/cuentas" className="font-semibold text-primary">creá una cuenta tuya</Link>.</div>
      ) : (
        <MovementForm key={searchParams.ok} action={add} mine={mine} others={others} categories={categories} today={todayIso} me={m.name} />
      )}

      <nav aria-label="Filtrar por miembro" className="-mx-1 mt-7 flex gap-2 overflow-x-auto px-1 pb-1">
        <Link href="/movimientos" aria-current={!quien ? "page" : undefined} className={`pill shrink-0 ${!quien ? "pill-on" : ""}`}>Todos</Link>
        {people.map((p) => (
          <Link key={p.id} href={`/movimientos?quien=${p.id}`} aria-current={quien === p.id ? "page" : undefined} className={`pill shrink-0 pl-1.5 ${quien === p.id ? "pill-on" : ""}`}>
            <Avatar name={p.name} size="sm" />{p.id === m.id ? `${p.name} (yo)` : p.name}
          </Link>
        ))}
      </nav>

      {txs.length === 0 ? (
        <div className="mt-4"><Empty>Todavía no hay movimientos{quien ? " de esta persona" : ""}.</Empty></div>
      ) : (
        groups.map((g) => (
          <section key={g.label} className="mt-6">
            <div className="mb-2 flex items-baseline justify-between px-1">
              <h2 className="font-bold">{g.label}</h2>
              <span className="text-sm text-muted tabular-nums">{g.net > 0n ? "+" : g.net < 0n ? "-" : ""}{fmt(g.net < 0n ? -g.net : g.net)}</span>
            </div>
            <ul className="card divide-y divide-line py-1">
              {g.items.map((t) => (
                <li key={t.id}>
                  <MovementRow t={t} chips action={!t.voidedAt ? (
                    <form action={voidTx}><input type="hidden" name="id" value={t.id} /><button className="text-[11px] font-medium text-muted hover:text-neg">Anular</button></form>
                  ) : undefined} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
