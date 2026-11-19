// Qué usa una cuenta (para decidir cómo se puede eliminar). SOLO servidor: no es una server action.
import { db } from "./db";
import { accountBalances } from "./balances";

export const usage = (id: string) => Promise.all([
  db.transaction.count({ where: { OR: [{ accountId: id }, { toAccountId: id }] } }),
  db.savingsMovement.count({ where: { accountId: id } }),
  db.subscription.count({ where: { accountId: id } }),
  db.transaction.count({ where: { OR: [{ accountId: id }, { toAccountId: id }], installmentId: { not: null } } }),
]);

/** Datos para el modal de confirmación. */
export async function deleteInfo(householdId: string, id: string) {
  const [[txs, savings, subs, installments], accounts, balances] = await Promise.all([
    usage(id),
    db.account.findMany({ where: { householdId }, select: { id: true, name: true, currency: true, ownerMemberId: true } }),
    accountBalances(householdId, { accountId: id }),
  ]);
  const blockers = [savings && "movimientos de ahorro", subs && "suscripciones", installments && "cuotas de tarjeta pagadas"].filter(Boolean) as string[];
  return { txs, balance: balances.get(id) ?? 0n, onlyAccount: accounts.length === 1, deleteBlock: blockers.length ? `No se pueden borrar sus movimientos porque tiene ${blockers.join(", ")}. Movelos a otra cuenta.` : null, accounts };
}

