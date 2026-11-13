// Fechas "de calendario" (columnas @db.Date): siempre medianoche UTC.

const daysIn = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

/** Día `day` del mes (y, m0); si el mes es más corto, el último día (31 -> 28/29/30). m0 puede desbordar. */
export function dayOf(y: number, m0: number, day: number): Date {
  const first = new Date(Date.UTC(y, m0, 1));
  const Y = first.getUTCFullYear(), M = first.getUTCMonth();
  return new Date(Date.UTC(Y, M, Math.min(day, daysIn(Y, M))));
}

export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
export const addMonths = (d: Date, n: number, anchorDay = d.getUTCDate()) => dayOf(d.getUTCFullYear(), d.getUTCMonth() + n, anchorDay);
export const iso = (d: Date) => d.toISOString().slice(0, 10);

export type Cycle = "WEEKLY" | "MONTHLY" | "YEARLY";
export const CYCLES: Record<Cycle, string> = { WEEKLY: "Semanal", MONTHLY: "Mensual", YEARLY: "Anual" };

/** Próxima fecha de cobro de una suscripción. */
export function nextCycle(d: Date, cycle: Cycle, anchorDay?: number): Date {
  if (cycle === "WEEKLY") return addDays(d, 7);
  return addMonths(d, cycle === "MONTHLY" ? 1 : 12, anchorDay);
}

/** Primera fecha del ciclo que cae después de `today` (para reanudar una suscripción pausada sin cobrar lo atrasado). */
export function rollForward(d: Date, cycle: Cycle, today: Date): Date {
  let x = d;
  for (let i = 0; x <= today && i < 1000; i++) x = nextCycle(x, cycle, d.getUTCDate());
  return x;
}

/**
 * Cronograma de cuotas de una compra con tarjeta.
 * Si la compra es hasta el día de cierre (inclusive) entra en el cierre de ese mes; si es después, en el del mes siguiente.
 * El vencimiento es en el mismo mes del cierre si dueDay > closingDay; si no, en el mes siguiente.
 * La cuota n entra en el cierre n-1 meses después del primero.
 */
export function installmentSchedule(purchase: Date, closingDay: number, dueDay: number, count: number) {
  const y = purchase.getUTCFullYear(), m = purchase.getUTCMonth();
  const first = purchase <= dayOf(y, m, closingDay) ? m : m + 1;
  const dueShift = dueDay > closingDay ? 0 : 1;
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    closingDate: dayOf(y, first + i, closingDay),
    dueDate: dayOf(y, first + i + dueShift, dueDay),
  }));
}

/** Divide un total en centavos en `n` cuotas que suman exactamente el total (el resto va a la primera). */
export function splitAmount(total: bigint, n: number): bigint[] {
  const N = BigInt(n), base = total / N;
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + (total % N) : base));
}
