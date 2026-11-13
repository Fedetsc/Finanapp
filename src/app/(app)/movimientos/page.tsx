import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { fail } from "@/lib/action";
import { fdate, fmt, parseDate, toCents, todayAR } from "@/lib/util";
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

export default async function Movimientos({ searchParams }: { searchParams: { e?: string; ok?: string } }) {
  const m = await requireMember();
  const where = { householdId: m.householdId };
  const [accounts, categories, txs] = await Promise.all([
    db.account.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true, ownerMemberId: true, owner: { select: { name: true } } } }),
    db.category.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.transaction.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 50, include: { category: true, account: true, toAccount: true, member: true } }),
  ]);
  const mine = accounts.filter((a) => a.ownerMemberId === m.id).map(({ id, name }) => ({ id, name }));
  const byOwner = new Map<string, { id: string; name: string }[]>();
  accounts.filter((a) => a.ownerMemberId !== m.id).forEach((a) => byOwner.set(a.owner.name, [...(byOwner.get(a.owner.name) ?? []), { id: a.id, name: a.name }]));
  const others = [...byOwner].map(([owner, accounts]) => ({ owner, accounts }));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Movimientos</h1>
      <Err e={searchParams.e} />
      {searchParams.ok && <p className="rounded-lg border border-pos/40 bg-pos/10 p-3 text-sm text-pos">Movimiento guardado.</p>}
      {mine.length === 0 ? (
        <p id="nuevo" className="card text-center text-sm text-muted">Para registrar movimientos, primero <a href="/cuentas" className="text-primary underline">creá una cuenta tuya</a>.</p>
      ) : (
        <MovementForm key={searchParams.ok} action={add} mine={mine} others={others} categories={categories} today={todayAR()} />
      )}
      {txs.length === 0 ? (
        <p className="card text-center text-sm text-muted">Todavía no hay movimientos.</p>
      ) : (
        <ul className="card divide-y divide-line py-1">
          {txs.map((t) => {
            const transfer = t.type === "TRANSFER";
            const route = `De ${t.account.name} → A ${t.toAccount?.name ?? "?"}`;
            const meta = transfer ? [fdate(t.date), route, t.member.name] : [fdate(t.date), t.category?.name, t.account.name, t.member.name];
            const color = t.voidedAt ? "text-muted line-through" : transfer ? "text-primary" : t.type === "INCOME" ? "text-pos" : "text-neg";
            return (
              <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className={`flex items-center gap-2 text-sm ${t.voidedAt ? "text-muted line-through" : ""}`}>
                    {transfer && <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary no-underline">Transferencia</span>}
                    <span className="truncate">{transfer ? (t.description && t.description !== "Transferencia" ? t.description : route) : t.description || t.category?.name}</span>
                  </p>
                  <p className="text-xs text-muted">{meta.filter(Boolean).join(" / ")}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className={`text-sm font-medium ${color}`}>{transfer ? "⇄ " : t.type === "EXPENSE" ? "-" : "+"}{fmt(t.amount)}</span>
                  {!t.voidedAt && <form action={voidTx}><input type="hidden" name="id" value={t.id} /><button className="text-xs text-muted hover:text-neg">Anular</button></form>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
