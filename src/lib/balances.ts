import type { Prisma } from "@prisma/client";
import { db } from "./db";

type Client = Prisma.TransactionClient | typeof db;

/**
 * Saldo de cada cuenta del hogar (centavos):
 *   saldo inicial + ingresos − gastos − transferencias salientes + transferencias entrantes
 *   − apartado a ahorro + retirado de ahorro.
 * `accountId` limita el cálculo a una sola cuenta (para validar dentro de un $transaction).
 */
export async function accountBalances(householdId: string, opts: { client?: Client; accountId?: string } = {}) {
  const c = opts.client ?? db;
  const one = opts.accountId ? { id: opts.accountId } : {};
  const [accs, out, inc, savings] = await Promise.all([
    c.account.findMany({ where: { householdId, ...one }, select: { id: true, openingBalance: true } }),
    c.transaction.groupBy({ by: ["accountId", "type"], where: { householdId, voidedAt: null, ...(opts.accountId ? { accountId: opts.accountId } : {}) }, _sum: { amount: true } }),
    c.transaction.groupBy({ by: ["toAccountId"], where: { householdId, voidedAt: null, type: "TRANSFER", ...(opts.accountId ? { toAccountId: opts.accountId } : {}) }, _sum: { amount: true } }),
    c.savingsMovement.groupBy({ by: ["accountId", "type"], where: { householdId, ...(opts.accountId ? { accountId: opts.accountId } : {}) }, _sum: { amount: true } }),
  ]);
  const map = new Map<string, bigint>(accs.map((a) => [a.id, a.openingBalance]));
  const add = (id: string | null, v: bigint) => { if (id && map.has(id)) map.set(id, map.get(id)! + v); };
  out.forEach((s) => add(s.accountId, (s.type === "INCOME" ? 1n : -1n) * (s._sum.amount ?? 0n)));
  inc.forEach((s) => add(s.toAccountId, s._sum.amount ?? 0n));
  savings.forEach((s) => add(s.accountId, (s.type === "WITHDRAW" ? 1n : -1n) * (s._sum.amount ?? 0n)));
  return map;
}
