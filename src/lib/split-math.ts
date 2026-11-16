// Cuentas de la División de gastos (estilo SplitWise). Sin base de datos ni "use client": se testean y sirven en server y client.
// Todo en centavos (BigInt). Nada de esto toca los movimientos reales del hogar.
import { splitEqual, splitPercent } from "./goal-math";

export type SplitMode = "equal" | "percent" | "amount";
/** Parte de cada participante en un gasto: participantId -> centavos. Suma exactamente el monto del gasto. */
export type Shares = Record<string, bigint>;
export type SplitExp = { paidBy: string; amount: bigint; shares: Shares };
export type Debt = { from: string; to: string; amount: bigint };
export type Balance = { paid: bigint; owed: bigint; net: bigint };

/** Partes iguales entre los elegidos (los centavos que sobran van a los primeros). */
export function equalShares(amount: bigint, ids: string[]): Shares {
  if (!ids.length) throw new Error("Elegí al menos una persona para dividir el gasto");
  const parts = splitEqual(amount, ids.length);
  return Object.fromEntries(ids.map((id, i) => [id, parts[i]]));
}

/** Porcentajes enteros que suman 100 (los de 0% quedan afuera). */
export function percentShares(amount: bigint, pcts: Record<string, number>): Shares {
  const ids = Object.keys(pcts);
  const parts = splitPercent(amount, ids.map((id) => pcts[id]));
  return Object.fromEntries(ids.map((id, i) => [id, parts[i]]).filter(([, v]) => (v as bigint) > 0n));
}

/** Montos específicos: tienen que sumar exactamente el gasto. */
export function amountShares(amount: bigint, amounts: Record<string, bigint>): Shares {
  const entries = Object.entries(amounts).filter(([, v]) => v > 0n);
  if (Object.values(amounts).some((v) => v < 0n)) throw new Error("Los montos no pueden ser negativos");
  const sum = entries.reduce((a, [, v]) => a + v, 0n);
  if (sum !== amount) throw new Error("Los montos de cada uno tienen que sumar el total del gasto");
  return Object.fromEntries(entries);
}

/** splitDetails guardado en la base -> Shares. Acepta { shares: { id: "centavos" } }. */
export function readShares(json: unknown): Shares {
  const raw = (json && typeof json === "object" ? (json as { shares?: unknown }).shares : null) ?? {};
  const out: Shares = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && /^\d+$/.test(v)) out[id] = BigInt(v);
  }
  return out;
}
export const writeShares = (s: Shares) => Object.fromEntries(Object.entries(s).map(([id, v]) => [id, v.toString()]));

/**
 * Paso 1-3: cuánto pagó cada uno, cuánto le tocaba y el balance (pagado - parte).
 * Los pagos ya saldados (from -> to) cuentan como si "from" hubiera pagado de más y "to" recibido:
 * así la deuda saldada desaparece de pendientes. Positivo = le deben. Negativo = debe.
 */
export function balances(ids: string[], expenses: SplitExp[], settlements: Debt[] = []): Map<string, Balance> {
  const b = new Map(ids.map((id) => [id, { paid: 0n, owed: 0n, net: 0n }]));
  const get = (id: string) => { let x = b.get(id); if (!x) { x = { paid: 0n, owed: 0n, net: 0n }; b.set(id, x); } return x; };
  for (const e of expenses) {
    get(e.paidBy).paid += e.amount;
    for (const [id, v] of Object.entries(e.shares)) get(id).owed += v;
  }
  for (const x of b.values()) x.net = x.paid - x.owed;
  for (const s of settlements) { get(s.from).net += s.amount; get(s.to).net -= s.amount; }
  return b;
}

/**
 * Paso 4: saldar con la menor cantidad de transferencias (método greedy: el que más debe le paga al que más tiene que cobrar).
 * Siempre da como mucho n-1 transferencias. Empates: en el orden de `ids` (resultado estable).
 */
export function simplify(ids: string[], net: Map<string, bigint>): Debt[] {
  const order = (id: string) => { const i = ids.indexOf(id); return i < 0 ? ids.length : i; };
  const debtors = [...net].filter(([, v]) => v < 0n).map(([id, v]) => ({ id, v: -v }));
  const creditors = [...net].filter(([, v]) => v > 0n).map(([id, v]) => ({ id, v }));
  const sort = (a: { id: string; v: bigint }, b: { id: string; v: bigint }) => (a.v === b.v ? order(a.id) - order(b.id) : a.v > b.v ? -1 : 1);
  const out: Debt[] = [];
  while (debtors.length && creditors.length) {
    debtors.sort(sort); creditors.sort(sort);
    const d = debtors[0], c = creditors[0];
    const amount = d.v < c.v ? d.v : c.v;
    out.push({ from: d.id, to: c.id, amount });
    d.v -= amount; c.v -= amount;
    if (d.v === 0n) debtors.shift();
    if (c.v === 0n) creditors.shift();
  }
  return out;
}

/** Atajo: deudas pendientes simplificadas de una división. */
export function pendingDebts(ids: string[], expenses: SplitExp[], settlements: Debt[] = []): Debt[] {
  const b = balances(ids, expenses, settlements);
  return simplify(ids, new Map([...b].map(([id, x]) => [id, x.net])));
}
