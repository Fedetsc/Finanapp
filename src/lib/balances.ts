import type { Prisma } from "@prisma/client";
import { db } from "./db";

type Client = Prisma.TransactionClient | typeof db;

/**
 * Saldo de cada cuenta del hogar (centavos):
 *   saldo inicial + ingresos − gastos − transferencias salientes + transferencias entrantes
 *   (entrantes: toAmount, en la moneda de destino; las transferencias viejas sin toAmount usan amount)
 *   − apartado a ahorro + retirado de ahorro.
 *   Los rendimientos (YIELD) suman como los ingresos.
 * `accountId` limita el cálculo a una sola cuenta (para validar dentro de un $transaction).
 * `until` (opcional): saldo al cierre de ese día (solo movimientos con fecha <= until). Lo usan los rendimientos.
 * Cuentas vinculadas con Mercado Pago (real, no de prueba): el saldo actual es el último leído de Mercado Pago
 * (solo si está en la moneda de la cuenta). Con `until` se usa siempre el cálculo por movimientos.
 */
export async function accountBalances(householdId: string, opts: { client?: Client; accountId?: string; until?: Date } = {}) {
  const c = opts.client ?? db;
  const one = opts.accountId ? { id: opts.accountId } : {};
  const upTo = opts.until ? { date: { lte: opts.until } } : {};
  const inWhere = { householdId, voidedAt: null, type: "TRANSFER" as const, ...upTo, ...(opts.accountId ? { toAccountId: opts.accountId } : {}) };
  const [accs, out, inc, incFx, savings, mp] = await Promise.all([
    c.account.findMany({ where: { householdId, ...one }, select: { id: true, openingBalance: true, currency: true } }),
    c.transaction.groupBy({ by: ["accountId", "type"], where: { householdId, voidedAt: null, ...upTo, ...(opts.accountId ? { accountId: opts.accountId } : {}) }, _sum: { amount: true } }),
    c.transaction.groupBy({ by: ["toAccountId"], where: { ...inWhere, toAmount: null }, _sum: { amount: true } }),
    c.transaction.groupBy({ by: ["toAccountId"], where: { ...inWhere, toAmount: { not: null } }, _sum: { toAmount: true } }),
    c.savingsMovement.groupBy({ by: ["accountId", "type"], where: { householdId, ...upTo, ...(opts.accountId ? { accountId: opts.accountId } : {}) }, _sum: { amount: true } }),
    opts.until ? [] : c.mpConnection.findMany({ where: { householdId, liveMode: true, balance: { not: null }, ...(opts.accountId ? { accountId: opts.accountId } : {}) }, select: { accountId: true, balance: true, balanceCurrency: true } }),
  ]);
  const map = new Map<string, bigint>(accs.map((a) => [a.id, a.openingBalance]));
  const add = (id: string | null, v: bigint) => { if (id && map.has(id)) map.set(id, map.get(id)! + v); };
  out.forEach((s) => add(s.accountId, (s.type === "INCOME" || s.type === "YIELD" ? 1n : -1n) * (s._sum.amount ?? 0n)));
  inc.forEach((s) => add(s.toAccountId, s._sum.amount ?? 0n));
  incFx.forEach((s) => add(s.toAccountId, s._sum.toAmount ?? 0n));
  savings.forEach((s) => add(s.accountId, (s.type === "WITHDRAW" ? 1n : -1n) * (s._sum.amount ?? 0n)));
  const currencyOf = new Map(accs.map((a) => [a.id, a.currency]));
  mp.forEach((x) => { if (x.balance !== null && map.has(x.accountId) && x.balanceCurrency === currencyOf.get(x.accountId)) map.set(x.accountId, x.balance); });
  return map;
}
