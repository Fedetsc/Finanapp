// Cálculo de rendimientos (puro, sin base de datos). Sin "use client".

/** Tipos de cuenta que pueden generar rendimientos (todo menos efectivo). */
export const YIELD_ACCOUNT_TYPES = ["BANK", "SAVINGS", "PAYROLL", "WALLET", "INVESTMENT"] as const;
export const canYield = (type: string) => (YIELD_ACCOUNT_TYPES as readonly string[]).includes(type);

const SCALE = 1_000_000n; // la TNA se maneja escalada ×1.000.000 (35,5% -> 35_500_000n)
const DIVISOR = 100n * 365n * SCALE;

/**
 * Rendimiento de un día (interés simple diario): saldo × TNA / 100 / 365, redondeado al centavo.
 * Ej.: $100.000 al 36,5% = $100. Saldo <= 0: no rinde.
 */
export function dailyYield(balanceCents: bigint, annualRate: bigint): bigint {
  if (balanceCents <= 0n || annualRate <= 0n) return 0n;
  return (balanceCents * annualRate + DIVISOR / 2n) / DIVISOR;
}

/** Valida los campos de rendimientos del form (YieldFields) y devuelve lo que se guarda en Account. */
export function parseYieldForm(f: { yieldEnabled?: string; yieldRate?: string; yieldManual?: string }, type: string, parseRate: (s: string) => bigint, toDecimal: (v: bigint) => string) {
  if (f.yieldEnabled !== "on") return { yieldEnabled: false as const };
  if (!canYield(type)) throw new Error("Las cuentas de efectivo no generan rendimientos");
  if (!f.yieldRate?.trim()) throw new Error("Poné la TNA de la cuenta");
  let scaled: bigint;
  try { scaled = parseRate(f.yieldRate); } catch { throw new Error("TNA inválida. Ejemplo: 35 o 35,5"); }
  if (scaled > 1000n * SCALE) throw new Error("La TNA no puede ser mayor a 1000%");
  return { yieldEnabled: true as const, yieldAnnualRate: toDecimal(scaled), yieldAutoAccrue: f.yieldManual !== "on" };
}
