import { db } from "./db";
import { decimalToRate, money, toArs } from "./currency";

export type RefRate = { rate: bigint; decimal: string; updatedAt: Date };

/** Cotizaciones de referencia del hogar (pesos por 1 unidad), por moneda. */
export async function referenceRates(householdId: string): Promise<Map<string, RefRate>> {
  const rows = await db.exchangeRate.findMany({ where: { householdId }, select: { currency: true, rate: true, updatedAt: true } });
  return new Map(rows.map((r) => {
    const decimal = r.rate.toFixed(6).replace(/\.?0+$/, "");
    return [r.currency, { rate: decimalToRate(decimal), decimal, updatedAt: r.updatedAt }];
  }));
}

/** "≈ $120.000,00" para un saldo en otra moneda, o null si es ARS o no hay cotización cargada. */
export function arsEquivalent(cents: bigint, currency: string, rates: Map<string, RefRate>): string | null {
  if (currency === "ARS") return null;
  const r = rates.get(currency);
  return r ? `≈ ${money(toArs(cents, r.rate))}` : null;
}
