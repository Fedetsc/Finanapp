import { db } from "./db";

/** Saldo comprometido por tarjeta: cuotas sin pagar de compras activas. */
export async function pendingByCard(cardIds: string[]) {
  if (cardIds.length === 0) return new Map<string, bigint>();
  const rows = await db.installment.findMany({
    where: { status: { not: "PAID" }, purchase: { cardId: { in: cardIds }, status: "ACTIVE" } },
    select: { amount: true, purchase: { select: { cardId: true } } },
  });
  const map = new Map<string, bigint>();
  rows.forEach((r) => map.set(r.purchase.cardId, (map.get(r.purchase.cardId) ?? 0n) + r.amount));
  return map;
}

export const STATUS_LABEL = { PENDING: "Pendiente", AWAITING_CONFIRMATION: "Esperando confirmación", PAID: "Pagada" } as const;
export const STATUS_CLS = { PENDING: "bg-line text-muted", AWAITING_CONFIRMATION: "bg-warn/15 text-warn", PAID: "bg-pos/10 text-pos" } as const;
