import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { fail } from "@/lib/action";
import { ACCOUNT_TYPES, fmt, toCents } from "@/lib/util";
import Err from "@/components/Err";

async function add(fd: FormData) {
  "use server";
  const m = await requireMember();
  try {
    const r = z.object({ name: z.string().trim().min(1).max(50), type: z.enum(["BANK", "SAVINGS", "PAYROLL", "WALLET", "CASH", "INVESTMENT"]), opening: z.string() }).parse(Object.fromEntries(fd));
    await db.account.create({ data: { householdId: m.householdId, name: r.name, type: r.type, openingBalance: toCents(r.opening || "0") } });
  } catch (e) { fail("/cuentas", e); }
  revalidatePath("/", "layout");
  redirect(`/cuentas?ok=${Date.now()}`);
}

export default async function Cuentas({ searchParams }: { searchParams: { e?: string; ok?: string } }) {
  const m = await requireMember();
  const where = { householdId: m.householdId };
  const [accs, sums] = await Promise.all([
    db.account.findMany({ where, orderBy: { createdAt: "asc" } }),
    db.transaction.groupBy({ by: ["accountId", "type"], where: { ...where, voidedAt: null }, _sum: { amount: true } }),
  ]);
  const balance = (id: string, opening: bigint) =>
    sums.filter((s) => s.accountId === id).reduce((t, s) => t + (s.type === "INCOME" ? 1n : -1n) * (s._sum.amount ?? 0n), opening);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Cuentas</h1>
      <Err e={searchParams.e} />
      <form key={searchParams.ok} action={add} className="card grid gap-3 md:grid-cols-4">
        <input name="name" required placeholder="Nombre (ej. Mercado Pago)" className="input md:col-span-2" />
        <select name="type" className="input">{Object.entries(ACCOUNT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input name="opening" inputMode="decimal" placeholder="Saldo inicial (opcional)" className="input" />
        <button className="btn md:col-span-4">Agregar cuenta</button>
      </form>
      {accs.length === 0 ? (
        <p className="card text-center text-sm text-muted">Todavía no hay cuentas. Agregá la primera para registrar movimientos.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {accs.map((a) => (
            <li key={a.id} className="card">
              <p className="text-xs text-muted">{ACCOUNT_TYPES[a.type]}</p>
              <p className="font-medium">{a.name}</p>
              <p className="mt-2 text-xl font-semibold">{fmt(balance(a.id, a.openingBalance))}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
