"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { requireMember } from "./session";
import { fail } from "./action";
import { toCents } from "./util";
import { splitEqual, splitPercent } from "./goal-math";

type Tx = Prisma.TransactionClient;
const Period = z.object({ year: z.coerce.number().int().min(2020).max(2100), month: z.coerce.number().int().min(1).max(12) });
const back = (p: { year: number; month: number }, q: string) => `/hogar?mes=${p.year}-${String(p.month).padStart(2, "0")}&${q}#objetivo`;
const backErr = (fd: FormData) => { const r = Period.safeParse(Object.fromEntries(fd)); return r.success ? `/hogar?mes=${r.data.year}-${String(r.data.month).padStart(2, "0")}` : "/hogar"; };
const currencyOf = (v: FormDataEntryValue | null) => { const c = String(v ?? "ARS"); if (!/^[A-Z][A-Z_]{1,15}$/.test(c)) throw new Error("Moneda inválida"); return c; };
const positive = (v: FormDataEntryValue | null, what: string) => {
  const c = toCents(String(v ?? ""));
  if (c <= 0n) throw new Error(`${what} tiene que ser mayor a cero`);
  return c;
};

/** Crea o actualiza la meta (una por hogar o por miembro por mes). La unicidad la asegura la base. */
async function upsertGoal(tx: Tx, householdId: string, memberId: string | null, p: { year: number; month: number }, amount: bigint, currency: string) {
  const prev = await tx.monthlyGoal.findFirst({ where: { householdId, memberId, year: p.year, month: p.month }, select: { id: true } });
  if (prev) return tx.monthlyGoal.update({ where: { id: prev.id }, data: { amount, currency } });
  return tx.monthlyGoal.create({ data: { householdId, memberId, year: p.year, month: p.month, amount, currency } });
}

function friendly(e: unknown): unknown {
  // Dos personas guardando a la vez la misma meta: la base rechaza el duplicado.
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return new Error("Esa meta ya existe para este mes. Recargá y editala.");
  return e;
}

/**
 * Meta del hogar completo + (opcional) submetas por miembro:
 * split = none (solo hogar) | equal (partes iguales) | income (% de ingresos, editable) | custom (montos específicos que suman el total).
 */
export async function saveHouseholdGoal(fd: FormData) {
  const m = await requireMember();
  let p: { year: number; month: number } = { year: 0, month: 0 };
  try {
    p = Period.parse(Object.fromEntries(fd));
    const total = positive(fd.get("amount"), "El monto total");
    const currency = currencyOf(fd.get("currency"));
    const split = z.enum(["none", "equal", "income", "custom"]).parse(fd.get("split"));
    const members = await db.member.findMany({ where: { householdId: m.householdId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });

    let parts: bigint[] = [];
    if (split === "equal") parts = splitEqual(total, members.length);
    if (split === "income") parts = splitPercent(total, members.map((x) => Number(fd.get(`pct_${x.id}`) ?? NaN)));
    if (split === "custom") {
      parts = members.map((x) => positive(fd.get(`amt_${x.id}`), `El monto de ${x.name}`));
      const sum = parts.reduce((a, v) => a + v, 0n);
      if (sum !== total) throw new Error("Los montos por miembro tienen que sumar el total");
    }

    await db.$transaction(async (tx) => {
      const g = await upsertGoal(tx, m.householdId, null, p, total, currency);
      for (const [i, x] of members.entries()) if (parts[i] !== undefined) await upsertGoal(tx, m.householdId, x.id, p, parts[i], currency);
      await tx.auditLog.create({ data: { householdId: m.householdId, userId: m.userId, action: "UPSERT", entity: "MonthlyGoal", entityId: g.id } });
    });
  } catch (e) { fail(backErr(fd), friendly(e)); }
  revalidatePath("/", "layout");
  redirect(back(p, "meta=ok"));
}

/** Meta de un solo miembro del hogar. */
export async function saveMemberGoal(fd: FormData) {
  const m = await requireMember();
  let p: { year: number; month: number } = { year: 0, month: 0 };
  try {
    p = Period.parse(Object.fromEntries(fd));
    const amount = positive(fd.get("amount"), "El monto");
    const currency = currencyOf(fd.get("currency"));
    const target = await db.member.findFirst({ where: { id: String(fd.get("memberId") ?? ""), householdId: m.householdId }, select: { id: true } });
    if (!target) throw new Error("Elegí un miembro del hogar");
    await db.$transaction(async (tx) => {
      const g = await upsertGoal(tx, m.householdId, target.id, p, amount, currency);
      await tx.auditLog.create({ data: { householdId: m.householdId, userId: m.userId, action: "UPSERT", entity: "MonthlyGoal", entityId: g.id } });
    });
  } catch (e) { fail(backErr(fd), friendly(e)); }
  revalidatePath("/", "layout");
  redirect(back(p, "meta=ok"));
}

/** Borra una meta del mes (solo la elegida; las de los miembros se borran aparte). */
export async function deleteGoal(fd: FormData) {
  const m = await requireMember();
  const id = String(fd.get("id") ?? "");
  const g = await db.monthlyGoal.findFirst({ where: { id, householdId: m.householdId }, select: { id: true, year: true, month: true } });
  if (g) {
    await db.$transaction([
      db.monthlyGoal.delete({ where: { id: g.id } }),
      db.auditLog.create({ data: { householdId: m.householdId, userId: m.userId, action: "DELETE", entity: "MonthlyGoal", entityId: g.id } }),
    ]);
  }
  revalidatePath("/", "layout");
  redirect(g ? back(g, "meta=borrada") : "/hogar#objetivo");
}
