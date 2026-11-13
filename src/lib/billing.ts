import { Prisma } from "@prisma/client";
import { db } from "./db";
import { nextCycle } from "./dates";
import { parseDate, todayAR } from "./util";

type Tx = Prisma.TransactionClient;
export const today = () => parseDate(todayAR());

/** Busca o crea una categoría interna del hogar ("Suscripciones", "Tarjeta de Crédito"). */
export async function systemCategory(tx: Tx, householdId: string, name: string) {
  const c = await tx.category.upsert({ where: { householdId_name: { householdId, name } }, create: { householdId, name }, update: {} });
  return c.id;
}

/**
 * Cobra las suscripciones activas del hogar con nextPaymentDate <= hoy.
 * Crea un EXPENSE por cada período vencido (si se atrasaron varios, uno por período),
 * a nombre del dueño de la suscripción y en su cuenta adherida.
 * Idempotente: el único (subscriptionId, date) en Transaction impide cobrar dos veces la misma fecha,
 * y el update condicionado a la nextPaymentDate leída evita carreras entre dos pestañas.
 */
export async function processDueSubscriptions(householdId: string): Promise<number> {
  const t = today();
  const due = await db.subscription.findMany({ where: { householdId, isActive: true, nextPaymentDate: { lte: t } } });
  let charged = 0;
  for (const s of due) {
    const anchor = s.nextPaymentDate.getUTCDate();
    let date = s.nextPaymentDate;
    for (let i = 0; date <= t && i < 120; i++) {
      const next = nextCycle(date, s.cycle, anchor);
      try {
        await db.$transaction(async (tx) => {
          const moved = await tx.subscription.updateMany({ where: { id: s.id, isActive: true, nextPaymentDate: date }, data: { nextPaymentDate: next, lastChargedDate: date } });
          if (moved.count !== 1) throw new Error("ya procesada");
          const categoryId = await systemCategory(tx, householdId, "Suscripciones");
          const created = await tx.transaction.create({
            data: { householdId, memberId: s.memberId, accountId: s.accountId, categoryId, subscriptionId: s.id, type: "EXPENSE", amount: s.amount, date, description: `Suscripción: ${s.name}` },
          });
          const owner = await tx.member.findUniqueOrThrow({ where: { id: s.memberId }, select: { userId: true } });
          await tx.auditLog.create({ data: { householdId, userId: owner.userId, action: "CHARGE", entity: "Subscription", entityId: created.id } });
        });
        charged++;
      } catch {
        break; // otro proceso ya la cobró o la pausaron: dejamos esta suscripción
      }
      date = next;
    }
  }
  return charged;
}

/** Pasa a AWAITING_CONFIRMATION las cuotas pendientes cuyo resumen ya cerró (hoy > fecha de cierre). */
export async function refreshInstallments(householdId: string) {
  await db.installment.updateMany({
    where: { status: "PENDING", closingDate: { lt: today() }, purchase: { householdId, status: "ACTIVE" } },
    data: { status: "AWAITING_CONFIRMATION" },
  });
}

/**
 * Paga cuotas con una cuenta propia, todo en un $transaction: por cada cuota crea su EXPENSE,
 * la marca PAID y actualiza la compra. Si cualquier validación falla, no se paga ninguna.
 * `onlyAwaiting`: confirmación manual (solo cuotas cuyo resumen cerró). Si es false, adelanto de pago.
 */
export async function payInstallments(m: { id: string; userId: string; householdId: string }, cardId: string, ids: string[], accountId: string, onlyAwaiting: boolean) {
  if (ids.length === 0) throw new Error("Elegí al menos una cuota");
  const [acc, card] = await Promise.all([db.account.findUnique({ where: { id: accountId } }), db.creditCard.findUnique({ where: { id: cardId } })]);
  if (!acc || acc.householdId !== m.householdId) throw new Error("Elegí una cuenta válida");
  if (acc.ownerMemberId !== m.id) throw new Error("No podés usar la cuenta de otro miembro");
  if (!card || card.householdId !== m.householdId) throw new Error("Tarjeta no encontrada");
  if (card.ownerMemberId !== m.id) throw new Error("No podés pagar la tarjeta de otro miembro");
  const allowed: ("PENDING" | "AWAITING_CONFIRMATION")[] = onlyAwaiting ? ["AWAITING_CONFIRMATION"] : ["PENDING", "AWAITING_CONFIRMATION"];
  const date = today();

  await db.$transaction(async (tx) => {
    const categoryId = await systemCategory(tx, m.householdId, "Tarjeta de Crédito");
    const items = await tx.installment.findMany({ where: { id: { in: ids }, purchase: { cardId: card.id } }, include: { purchase: true }, orderBy: [{ dueDate: "asc" }, { number: "asc" }] });
    if (items.length !== new Set(ids).size) throw new Error("Alguna cuota no pertenece a esta tarjeta");
    for (const it of items) {
      if (it.purchase.status !== "ACTIVE") throw new Error("La compra ya no está activa");
      // El update condicionado al estado evita pagar dos veces la misma cuota (doble click, dos pestañas).
      const r = await tx.installment.updateMany({ where: { id: it.id, status: { in: allowed } }, data: { status: "PAID", paidWithAccountId: acc.id, paidAt: new Date() } });
      if (r.count !== 1) throw new Error(it.status === "PAID" ? "Esa cuota ya está pagada" : "Esa cuota todavía no está para confirmar");
      const t = await tx.transaction.create({
        data: {
          householdId: m.householdId, memberId: m.id, accountId: acc.id, categoryId, installmentId: it.id, type: "EXPENSE", amount: it.amount, date,
          description: `Cuota ${it.number}/${it.purchase.installmentsCount} - ${it.purchase.description} - ${card.name}`.slice(0, 120),
        },
      });
      const p = await tx.creditCardPurchase.update({ where: { id: it.purchaseId }, data: { installmentsPaid: { increment: 1 } } });
      if (p.installmentsPaid >= p.installmentsCount) await tx.creditCardPurchase.update({ where: { id: p.id }, data: { status: "PAID" } });
      await tx.auditLog.create({ data: { householdId: m.householdId, userId: m.userId, action: "PAY", entity: "Installment", entityId: t.id } });
    }
  });
}
