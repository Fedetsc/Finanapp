// Cuentas de los objetivos de gasto (sin base de datos ni "use client": se testean y sirven en server y client).

export type GoalLevel = "ok" | "warn" | "over";

/** ok < 90% · warn: 90% o más · over: llegó o pasó el 100%. */
export function goalLevel(spent: bigint, amount: bigint): GoalLevel {
  if (amount <= 0n) return "ok";
  if (spent >= amount) return "over";
  if (spent * 100n >= amount * 90n) return "warn";
  return "ok";
}

/** Porcentaje gastado (entero, puede pasar de 100). */
export const goalPct = (spent: bigint, amount: bigint) => (amount > 0n ? Number((spent * 100n) / amount) : 0);

/** Divide en partes iguales; los centavos que sobran van a los primeros. */
export function splitEqual(total: bigint, n: number): bigint[] {
  if (n <= 0) return [];
  const base = total / BigInt(n);
  let rest = total - base * BigInt(n);
  return Array.from({ length: n }, () => { const extra = rest > 0n ? 1n : 0n; rest -= extra; return base + extra; });
}

/** Divide por porcentajes enteros que suman 100; el redondeo va al de mayor porcentaje. */
export function splitPercent(total: bigint, pcts: number[]): bigint[] {
  if (pcts.some((p) => !Number.isInteger(p) || p < 0) || pcts.reduce((a, p) => a + p, 0) !== 100) throw new Error("Los porcentajes tienen que sumar 100%");
  const parts = pcts.map((p) => (total * BigInt(p)) / 100n);
  const diff = total - parts.reduce((a, v) => a + v, 0n);
  const top = pcts.indexOf(Math.max(...pcts));
  parts[top] += diff;
  return parts;
}

/** Porcentajes enteros según los ingresos de cada uno (suman 100). Sin ingresos: partes iguales. */
export function incomeShares(incomes: bigint[]): number[] {
  const n = incomes.length;
  if (!n) return [];
  const total = incomes.reduce((a, v) => a + v, 0n);
  if (total <= 0n) { const eq = splitEqual(100n, n); return eq.map(Number); }
  const pcts = incomes.map((v) => Number((v * 100n) / total));
  pcts[incomes.indexOf(incomes.reduce((a, v) => (v > a ? v : a)))] += 100 - pcts.reduce((a, p) => a + p, 0);
  return pcts;
}
