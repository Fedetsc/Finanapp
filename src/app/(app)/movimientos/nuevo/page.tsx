import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { fail } from "@/lib/action";
import { parseDate, toCents, todayAR } from "@/lib/util";
import { convert, parseRate, rateToDecimal } from "@/lib/currency";
import { PageHeader } from "@/components/ui";
import Err from "@/components/Err";
import MovementForm from "@/components/MovementForm";

const base = { amount: z.string(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), accountId: z.string().min(1), description: z.string().trim().max(120) };
const Form = z.discriminatedUnion("type", [
  z.object({ type: z.enum(["INCOME", "EXPENSE"]), categoryId: z.string().min(1), ...base }),
  z.object({ type: z.literal("TRANSFER"), toAccountId: z.string().min(1), exchangeRate: z.string().optional(), ...base }),
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

    let data: { categoryId: string } | { toAccountId: string; toAmount: bigint; exchangeRate: string | null };
    let description = f.description;
    if (f.type === "TRANSFER") {
      // Destino: cualquier cuenta del hogar (también la del otro miembro), distinta del origen.
      const to = await db.account.findUnique({ where: { id: f.toAccountId } });
      if (!to || to.householdId !== m.householdId) throw new Error("Elegí una cuenta de destino válida");
      if (to.id === acc.id) throw new Error("La cuenta de origen y la de destino tienen que ser distintas");
      if (to.currency === acc.currency) {
        data = { toAccountId: to.id, toAmount: amount, exchangeRate: null };
      } else {
        // Monedas distintas: el usuario carga el tipo de cambio y se guarda junto con el monto que llega a destino.
        if (!f.exchangeRate?.trim()) throw new Error("Poné el tipo de cambio para transferir entre monedas distintas");
        const rate = parseRate(f.exchangeRate);
        const toAmount = convert(amount, acc.currency, to.currency, rate);
        if (toAmount <= 0n) throw new Error("Con ese tipo de cambio el monto en destino da cero");
        data = { toAccountId: to.id, toAmount, exchangeRate: rateToDecimal(rate) };
      }
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
  } catch (e) { fail("/movimientos/nuevo", e); }
  revalidatePath("/", "layout");
  redirect(`/movimientos?ok=${Date.now()}`);
}

/** Formulario de nuevo movimiento (botón + del menú). Al guardar vuelve a la lista de Movimientos. */
export default async function NuevoMovimiento({ searchParams }: { searchParams: { e?: string } }) {
  const m = await requireMember();
  const where = { householdId: m.householdId };
  const [accounts, categories] = await Promise.all([
    db.account.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true, currency: true, ownerMemberId: true, owner: { select: { name: true } } } }),
    db.category.findMany({ where, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const mine = accounts.filter((a) => a.ownerMemberId === m.id).map(({ id, name, currency }) => ({ id, name, currency }));
  const byOwner = new Map<string, { id: string; name: string; currency: string }[]>();
  accounts.filter((a) => a.ownerMemberId !== m.id).forEach((a) => byOwner.set(a.owner.name, [...(byOwner.get(a.owner.name) ?? []), { id: a.id, name: a.name, currency: a.currency }]));
  const others = [...byOwner].map(([owner, accounts]) => ({ owner, accounts }));

  return (
    <div>
      <PageHeader back={{ href: "/movimientos", label: "Movimientos" }} title="Nuevo movimiento" subtitle={m.household.name} />
      <Err e={searchParams.e} />
      {mine.length === 0 ? (
        <div className="card text-center text-sm text-muted">Para registrar movimientos, primero <Link href="/cuentas" className="font-semibold text-primary">creá una cuenta tuya</Link>.</div>
      ) : (
        <MovementForm action={add} mine={mine} others={others} categories={categories} today={todayAR()} me={m.name} />
      )}
    </div>
  );
}
