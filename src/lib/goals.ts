// Objetivos de gasto mensuales: lectura y "gastado" de cada meta. Lo usan Inicio y Hogar (server).
import { db } from "./db";
import { goalLevel, goalPct, type GoalLevel } from "./goal-math";

export type GoalView = {
  id: string;
  memberId: string | null; // null = meta del hogar
  amount: bigint;
  currency: string;
  spent: bigint;
  remaining: bigint; // negativo si se pasó
  pct: number;
  level: GoalLevel;
};

export const monthRange = (year: number, month: number) => ({ gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) });

/**
 * Metas del mes con lo gastado. Gastado = suma de gastos (EXPENSE, no anulados) del mes en la moneda de la meta:
 * del hogar entero para la meta del hogar, o los cargados por ese miembro para su meta.
 * No cuenta ingresos, transferencias ni rendimientos. Siempre usa el monto actual de la meta.
 */
export async function monthGoals(householdId: string, year: number, month: number): Promise<GoalView[]> {
  const goals = await db.monthlyGoal.findMany({ where: { householdId, year, month }, orderBy: { createdAt: "asc" }, select: { id: true, memberId: true, amount: true, currency: true } });
  if (!goals.length) return [];
  const currencies = [...new Set(goals.map((g) => g.currency))];
  const sums = await Promise.all(currencies.map((c) =>
    db.transaction.groupBy({ by: ["memberId"], where: { householdId, voidedAt: null, type: "EXPENSE", account: { currency: c }, date: monthRange(year, month) }, _sum: { amount: true } }).then((rows) => [c, rows] as const),
  ));
  const byCur = new Map(sums);
  return goals.map((g) => {
    const rows = byCur.get(g.currency) ?? [];
    const spent = rows.filter((r) => g.memberId === null || r.memberId === g.memberId).reduce((a, r) => a + (r._sum.amount ?? 0n), 0n);
    return { ...g, spent, remaining: g.amount - spent, pct: goalPct(spent, g.amount), level: goalLevel(spent, g.amount) };
  });
}
