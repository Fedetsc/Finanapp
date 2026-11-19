"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { requireMember } from "./session";
import { fail } from "./action";
import { fdate, toCents } from "./util";
import { money } from "./currency";
import { nextCycle } from "./dates";
import { systemCategory, today } from "./billing";

// Las suscripciones no se cobran solas: estas dos acciones son la única forma de cambiar el monto o registrar un cobro.

/** Solo se vuelve a /suscripciones o a su detalle (nunca a una URL que venga armada desde afuera). */
const backOf = (fd: FormData) => {
  const b = String(fd.get("back") ?? "");
  return /^\/suscripciones(\/[\w-]+)?$/.test(b) ? b : "/suscripciones";
};

/** Suscripción del hogar que pertenece al miembro actual (solo el dueño la cobra o la modifica). */
async function ownSub(id: string, m: { id: string; householdId: string }) {
  const s = await db.subscription.findUnique({ where: { id } });
  if (!s || s.householdId !== m.householdId) throw new Error("Suscripción no encontrada");
  if (s.memberId !== m.id) throw new Error("Solo quien creó la suscripción puede cobrarla o modificarla");
  return s;
}

/** Cuenta propia del miembro actual. */
async function ownAccount(id: string, m: { id: string; householdId: string }) {
  const acc = await db.account.findUnique({ where: { id } });
  if (!acc || acc.householdId !== m.householdId) throw new Error("Elegí una cuenta válida");
  if (acc.ownerMemberId !== m.id) throw new Error("No podés usar la cuenta de otro miembro");
  return acc;
}

const positive = (s: string) => {
  const v = toCents(s);
  if (v <= 0n) throw new Error("El monto debe ser mayor a cero");
  return v;
};

/**
 * "Modificar monto": cambia el monto (y opcionalmente la cuenta) para el próximo cobro y lo deja en el historial.
 * No crea ningún movimiento.
 */
export async function changeSubscriptionAmount(fd: FormData) {
  const m = await requireMember();
  const back = backOf(fd);
  try {
    const f = z.object({ id: z.string().min(1), amount: z.string().min(1, "Poné el monto"), accountId: z.string().optional(), note: z.string().trim().max(120).optional() }).parse(Object.fromEntries(fd));
    const s = await ownSub(f.id, m);
    const amount = positive(f.amount);
    // Cuenta opcional: si cambia, la suscripción pasa a cobrarse en la moneda de esa cuenta.
    const acc = f.accountId && f.accountId !== s.accountId ? await ownAccount(f.accountId, m) : null;
    if (amount === s.amount && !acc) throw new Error("No cambiaste el monto ni la cuenta");
    await db.$transaction([
      db.subscription.update({ where: { id: s.id }, data: { amount, ...(acc ? { accountId: acc.id, currency: acc.currency } : {}) } }),
      db.subscriptionChange.create({
        data: { householdId: m.householdId, subscriptionId: s.id, memberId: m.id, oldAmount: s.amount, newAmount: amount, oldAccountId: acc ? s.accountId : null, newAccountId: acc ? acc.id : null, note: f.note ?? "" },
      }),
      db.auditLog.create({ data: { householdId: m.householdId, userId: m.userId, action: "UPDATE_AMOUNT", entity: "Subscription", entityId: s.id } }),
    ]);
  } catch (e) { fail(back, e instanceof z.ZodError ? new Error(e.issues[0]?.message ?? "Revisá los datos") : e); }
  revalidatePath("/", "layout");
  redirect(`${back}?monto=${Date.now()}`);
}

/**
 * "Cobrar ahora": crea un gasto normal (categoría Suscripciones, fecha de hoy) en la cuenta elegida y
 * mueve el próximo cobro sugerido un ciclo desde hoy. Si el monto se editó, también queda como monto nuevo.
 * Un solo cobro por suscripción y por día: lo garantiza el único (subscriptionId, date) de Transaction.
 */
export async function chargeSubscription(fd: FormData) {
  const m = await requireMember();
  const back = backOf(fd);
  try {
    const f = z.object({ id: z.string().min(1), amount: z.string().min(1, "Poné el monto"), accountId: z.string().min(1, "Elegí la cuenta") }).parse(Object.fromEntries(fd));
    const s = await ownSub(f.id, m);
    if (!s.isActive) throw new Error("La suscripción está pausada: reanudala para cobrarla");
    const amount = positive(f.amount);
    const acc = await ownAccount(f.accountId, m);
    if (acc.currency !== s.currency) throw new Error("Esa cuenta es de otra moneda que la suscripción");
    const t = today();
    const done = await db.transaction.findFirst({ where: { subscriptionId: s.id, date: t }, select: { voidedAt: true } });
    if (done) throw new Error(done.voidedAt ? "El cobro de hoy está anulado: la podés volver a cobrar mañana" : "Esta suscripción ya se cobró hoy");

    await db.$transaction(async (tx) => {
      const categoryId = await systemCategory(tx, m.householdId, "Suscripciones");
      const created = await tx.transaction.create({
        data: { householdId: m.householdId, memberId: m.id, accountId: acc.id, categoryId, subscriptionId: s.id, type: "EXPENSE", amount, date: t, description: `Suscripción: ${s.name}`.slice(0, 120) },
      });
      await tx.subscription.update({ where: { id: s.id }, data: { lastChargedDate: t, nextPaymentDate: nextCycle(t, s.cycle, t.getUTCDate()), ...(amount !== s.amount ? { amount } : {}) } });
      if (amount !== s.amount) {
        await tx.subscriptionChange.create({ data: { householdId: m.householdId, subscriptionId: s.id, memberId: m.id, oldAmount: s.amount, newAmount: amount, note: "Ajustado al cobrar" } });
      }
      await tx.auditLog.create({ data: { householdId: m.householdId, userId: m.userId, action: "CHARGE", entity: "Subscription", entityId: created.id } });
    });
  } catch (e) {
    // Doble click o dos pestañas: el segundo choca con el único (subscriptionId, date).
    const dup = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
    fail(back, dup ? new Error("Esta suscripción ya se cobró hoy") : e instanceof z.ZodError ? new Error(e.issues[0]?.message ?? "Revisá los datos") : e);
  }
  revalidatePath("/", "layout");
  redirect(`${back}?cobrada=${Date.now()}`);
}

export type QuickPayResult = { ok: true; name: string; amount: string; next: string } | { ok: false; error: string };

/**
 * Pago rápido desde Inicio (sin salir de la página): gasto de hoy en la categoría Suscripciones por el monto
 * actual, en la cuenta elegida. El próximo cobro pasa a "fecha sugerida + 1 ciclo" (20/11 mensual -> 20/12).
 * Un solo cobro por suscripción y por día (único subscriptionId + date de Transaction).
 */
export async function paySubscriptionQuick(fd: FormData): Promise<QuickPayResult> {
  const m = await requireMember();
  try {
    const id = String(fd.get("id") ?? ""), accountId = String(fd.get("accountId") ?? "");
    const s = await ownSub(id, m);
    if (!s.isActive) throw new Error("La suscripción está pausada");
    const acc = await ownAccount(accountId, m);
    if (acc.currency !== s.currency) throw new Error("Esa cuenta es de otra moneda que la suscripción");
    const t = today();
    const next = nextCycle(s.nextPaymentDate, s.cycle, s.nextPaymentDate.getUTCDate());
    await db.$transaction(async (tx) => {
      const categoryId = await systemCategory(tx, m.householdId, "Suscripciones");
      const created = await tx.transaction.create({
        data: { householdId: m.householdId, memberId: m.id, accountId: acc.id, categoryId, subscriptionId: s.id, type: "EXPENSE", amount: s.amount, date: t, description: s.name.slice(0, 120) },
      });
      await tx.subscription.update({ where: { id: s.id }, data: { lastChargedDate: t, nextPaymentDate: next } });
      await tx.auditLog.create({ data: { householdId: m.householdId, userId: m.userId, action: "CHARGE", entity: "Subscription", entityId: created.id } });
    });
    revalidatePath("/", "layout");
    return { ok: true, name: s.name, amount: money(s.amount, s.currency), next: fdate(next) };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, error: "Esta suscripción ya se pagó hoy" };
    if (e instanceof Prisma.PrismaClientKnownRequestError || e instanceof Prisma.PrismaClientUnknownRequestError) { console.error("[paySubscriptionQuick]", e.message); return { ok: false, error: "No se pudo pagar. Probá de nuevo." }; }
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo pagar" };
  }
}
