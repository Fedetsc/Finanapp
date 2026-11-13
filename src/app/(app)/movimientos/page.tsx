import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { fail } from "@/lib/action";
import { fdate, fmt, toCents, todayAR } from "@/lib/util";
import Err from "@/components/Err";

async function add(fd: FormData) {
  "use server";
  const m = await requireMember();
  try {
    const f = z.object({ type: z.enum(["INCOME", "EXPENSE"]), amount: z.string(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), accountId: z.string(), categoryId: z.string(), description: z.string().trim().max(120) }).parse(Object.fromEntries(fd));
    const amount = toCents(f.amount);
    if (amount <= 0n) throw new Error("El importe debe ser mayor a cero");
    const [acc, cat] = await Promise.all([
      db.account.findFirst({ where: { id: f.accountId, householdId: m.householdId } }),
      db.category.findFirst({ where: { id: f.categoryId, householdId: m.householdId } }),
    ]);
    if (!acc || !cat) throw new Error("Elegí una cuenta y una categoría");
    await db.$transaction(async (tx) => {
      const t = await tx.transaction.create({ data: { householdId: m.householdId, memberId: m.id, accountId: acc.id, categoryId: cat.id, type: f.type, amount, date: new Date(f.date + "T00:00:00Z"), description: f.description } });
      await tx.auditLog.create({ data: { householdId: m.householdId, userId: m.userId, action: "CREATE", entity: "Transaction", entityId: t.id } });
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
    if (r.count === 1) await tx.auditLog.create({ data: { householdId: m.householdId, userId: m.userId, action: "VOID", entity: "Transaction", entityId: id } });
  });
  revalidatePath("/", "layout");
}

export default async function Movimientos({ searchParams }: { searchParams: { e?: string; ok?: string } }) {
  const m = await requireMember();
  const where = { householdId: m.householdId };
  const [accounts, categories, txs] = await Promise.all([
    db.account.findMany({ where, orderBy: { name: "asc" } }),
    db.category.findMany({ where, orderBy: { name: "asc" } }),
    db.transaction.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 50, include: { category: true, account: true, member: true } }),
  ]);
  const opt = (x: { id: string; name: string }) => <option key={x.id} value={x.id}>{x.name}</option>;
  const tab = "block cursor-pointer rounded-lg border border-line py-2.5 text-center text-sm peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-primary";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Movimientos</h1>
      <Err e={searchParams.e} />
      {searchParams.ok && <p className="rounded-lg border border-pos/40 bg-pos/10 p-3 text-sm text-pos">Movimiento guardado.</p>}
      {accounts.length === 0 ? (
        <p id="nuevo" className="card text-center text-sm text-muted">Para registrar movimientos, primero <a href="/cuentas" className="text-primary underline">creá una cuenta</a>.</p>
      ) : (
        <form id="nuevo" key={searchParams.ok} action={add} className="card grid gap-3 md:grid-cols-2">
          <div className="grid grid-cols-2 gap-2 md:col-span-2">
            <label><input type="radio" name="type" value="EXPENSE" defaultChecked className="peer sr-only" /><span className={`${tab} peer-checked:border-neg peer-checked:text-neg`}>Gasto</span></label>
            <label><input type="radio" name="type" value="INCOME" className="peer sr-only" /><span className={`${tab} peer-checked:border-pos peer-checked:text-pos`}>Ingreso</span></label>
          </div>
          <input name="amount" required inputMode="decimal" placeholder="Importe (ej. 12.500,00)" className="input" />
          <input name="date" type="date" required defaultValue={todayAR()} className="input" />
          <select name="accountId" required className="input">{accounts.map(opt)}</select>
          <select name="categoryId" required className="input">{categories.length ? categories.map(opt) : <option value="">Primero creá una categoría</option>}</select>
          <input name="description" maxLength={120} placeholder="Descripción (opcional)" className="input md:col-span-2" />
          <button className="btn md:col-span-2">Guardar movimiento</button>
        </form>
      )}
      {txs.length === 0 ? (
        <p className="card text-center text-sm text-muted">Todavía no hay movimientos.</p>
      ) : (
        <ul className="card divide-y divide-line py-1">
          {txs.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className={`truncate text-sm ${t.voidedAt ? "text-muted line-through" : ""}`}>{t.description || t.category.name}</p>
                <p className="text-xs text-muted">{[fdate(t.date), t.category.name, t.account.name, t.member.name].join(" / ")}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className={`text-sm font-medium ${t.voidedAt ? "text-muted line-through" : t.type === "INCOME" ? "text-pos" : "text-neg"}`}>{t.type === "EXPENSE" ? "-" : "+"}{fmt(t.amount)}</span>
                {!t.voidedAt && <form action={voidTx}><input type="hidden" name="id" value={t.id} /><button className="text-xs text-muted hover:text-neg">Anular</button></form>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
