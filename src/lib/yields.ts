import { db } from "./db";
import { accountBalances } from "./balances";
import { systemCategory, today } from "./billing";
import { addDays } from "./dates";
import { decimalToRate, formatRate } from "./currency";
import { dailyYield, YIELD_ACCOUNT_TYPES } from "./yield-math";

/** TNA guardada (Decimal) -> entero escalado ×1.000.000 y texto para mostrar ("35,5"). */
export function rateOf(d: { toFixed(n: number): string } | null) {
  if (!d) return null;
  const decimal = d.toFixed(6).replace(/\.?0+$/, "");
  return { scaled: decimalToRate(decimal), label: formatRate(decimal) };
}

const MAX_DAYS = 400; // tope de días a ponerse al día en una sola pasada

/**
 * Acredita los rendimientos pendientes (un movimiento YIELD por día) de las cuentas con rendimientos automáticos.
 * - `householdId`: solo ese hogar (al entrar a la app). Sin filtro: todas las cuentas (cron).
 * - Día D: se acredita el rendimiento sobre el saldo al cierre de D-1, con fecha D. lastYieldAt = último día acreditado.
 * - Idempotente: el update condicionado a lastYieldAt y el único (accountId, yieldDate) impiden acreditar dos veces
 *   el mismo día aunque el cron y un usuario corran a la vez, o el cron corra dos veces.
 * - Usa la TNA vigente al momento de acreditar: cambiarla no recalcula días ya acreditados.
 */
export async function accrueYields(householdId?: string): Promise<{ accounts: number; credited: number }> {
  const t = today();
  const accs = await db.account.findMany({
    where: {
      ...(householdId ? { householdId } : {}),
      yieldEnabled: true,
      yieldAutoAccrue: true,
      // Vinculadas con Mercado Pago real: el saldo ya es el de Mercado Pago (incluye lo que rindió).
      AND: [{ OR: [{ mpConnection: null }, { mpConnection: { liveMode: false } }] }],
      yieldAnnualRate: { not: null },
      type: { in: [...YIELD_ACCOUNT_TYPES] },
      OR: [{ lastYieldAt: null }, { lastYieldAt: { lt: t } }],
    },
    select: { id: true, householdId: true, ownerMemberId: true, yieldAnnualRate: true, lastYieldAt: true, owner: { select: { userId: true } } },
  });

  let credited = 0;
  for (const a of accs) {
    // Sin fecha de inicio (no debería pasar): arranca hoy, sin acreditar hacia atrás.
    if (!a.lastYieldAt) {
      await db.account.updateMany({ where: { id: a.id, lastYieldAt: null }, data: { lastYieldAt: t } });
      continue;
    }
    const rate = rateOf(a.yieldAnnualRate)!;
    let last = a.lastYieldAt;
    for (let i = 0; last < t && i < MAX_DAYS; i++) {
      const day = addDays(last, 1);
      const prev = last;
      try {
        await db.$transaction(async (tx) => {
          // Reserva el día: si otro proceso ya lo acreditó (o desactivaron los rendimientos), no hace nada.
          const moved = await tx.account.updateMany({ where: { id: a.id, yieldEnabled: true, yieldAutoAccrue: true, lastYieldAt: prev }, data: { lastYieldAt: day } });
          if (moved.count !== 1) throw new Error("ya acreditado");
          const balance = (await accountBalances(a.householdId, { client: tx, accountId: a.id, until: prev })).get(a.id) ?? 0n;
          const amount = dailyYield(balance, rate.scaled);
          if (amount <= 0n) return; // saldo en cero o negativo: el día se da por procesado sin movimiento
          const categoryId = await systemCategory(tx, a.householdId, "Rendimientos");
          const created = await tx.transaction.create({
            data: { householdId: a.householdId, memberId: a.ownerMemberId, accountId: a.id, categoryId, type: "YIELD", amount, date: day, yieldDate: day, description: `Rendimiento ${rate.label}% TNA` },
          });
          await tx.auditLog.create({ data: { householdId: a.householdId, userId: a.owner.userId, action: "YIELD", entity: "Account", entityId: created.id } });
          credited++;
        });
      } catch (e) {
        if (!(e instanceof Error && e.message === "ya acreditado")) console.error("[yields]", a.id, e instanceof Error ? e.message : e);
        break; // otro proceso se adelantó o falló: se sigue en la próxima pasada
      }
      last = day;
    }
  }
  return { accounts: accs.length, credited };
}
