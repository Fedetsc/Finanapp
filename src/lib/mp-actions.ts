"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "./db";
import { requireMember } from "./session";
import { syncMpBalance } from "./mp-sync";
import { toCents } from "./util";
import { systemCategory, today } from "./billing";

/**
 * Desvincula la cuenta: borra los tokens guardados. La cuenta vuelve a ser manual.
 * (El permiso también se puede revocar desde Mercado Pago > Seguridad > Aplicaciones conectadas.)
 */
export async function unlinkMp(fd: FormData) {
  const m = await requireMember();
  const accountId = String(fd.get("accountId") ?? "");
  const c = await db.mpConnection.findFirst({ where: { accountId, householdId: m.householdId }, select: { id: true, memberId: true } });
  if (!c) redirect(`/cuentas/${encodeURIComponent(accountId)}/mercadopago`);
  if (c.memberId !== m.id) redirect(`/cuentas/${encodeURIComponent(accountId)}/mercadopago?e=${encodeURIComponent("Solo quien la vinculó la puede desvincular")}`);
  await db.$transaction([
    db.mpConnection.delete({ where: { id: c.id } }),
    db.auditLog.create({ data: { householdId: m.householdId, userId: m.userId, action: "UNLINK", entity: "MpConnection", entityId: c.id } }),
  ]);
  revalidatePath("/cuentas", "layout");
  redirect(`/cuentas/${encodeURIComponent(accountId)}/mercadopago?ok=desvinculada`);
}

/** Conexión de la cuenta, solo para quien la vinculó (usa su token). Si no, vuelve con error. */
async function ownConnection(fd: FormData) {
  const m = await requireMember();
  const accountId = String(fd.get("accountId") ?? "");
  const back = `/cuentas/${encodeURIComponent(accountId)}/mercadopago`;
  const c = await db.mpConnection.findFirst({ where: { accountId, householdId: m.householdId }, select: { id: true, memberId: true } });
  if (!c) redirect(back);
  if (c.memberId !== m.id) redirect(`${back}?e=${encodeURIComponent("Solo quien la vinculó puede hacer esto")}`);
  return { m, c, back };
}

/**
 * Saldo inicial o "Corregir saldo": lo que el usuario ve ahora en la app de Mercado Pago.
 * Desde este momento se suman los pagos. Al corregir, la diferencia con el saldo calculado
 * (transferencias por CVU, rendimientos, etc. que no vienen como pagos) queda como un movimiento de ajuste.
 */
export async function setMpBase(fd: FormData) {
  const { m, c, back } = await ownConnection(fd);
  let cents: bigint;
  try { cents = toCents(String(fd.get("base") ?? "").replace("$", "")); } catch { redirect(`${back}?e=${encodeURIComponent("Escribí el saldo, por ejemplo 125.000,50")}#saldo-inicial`); }
  if (cents < 0n) redirect(`${back}?e=${encodeURIComponent("El saldo no puede ser negativo")}#saldo-inicial`);

  const conn = await db.mpConnection.findUniqueOrThrow({ where: { id: c.id }, select: { baseBalance: true, balance: true, accountId: true } });
  // Corrección: primero se recalcula con los pagos al día, para que la diferencia sea solo lo que no vino como pago.
  let diff = 0n;
  if (conn.baseBalance !== null) {
    const r = await syncMpBalance(c.id);
    const current = r?.ok ? r.balance : conn.balance;
    if (current !== null) diff = cents - current;
  }

  await db.$transaction(async (tx) => {
    await tx.mpConnection.update({ where: { id: c.id }, data: { baseBalance: cents, baseAt: new Date(), balance: cents, balanceCurrency: null, lastSyncAt: null, syncError: null } });
    if (diff !== 0n) {
      const categoryId = await systemCategory(tx, m.householdId, "Ajuste de saldo");
      const t = await tx.transaction.create({
        data: { householdId: m.householdId, memberId: m.id, accountId: conn.accountId, categoryId, type: diff > 0n ? "INCOME" : "EXPENSE", amount: diff > 0n ? diff : -diff, date: today(), description: "Ajuste de saldo Mercado Pago (corrección manual)" },
      });
      await tx.auditLog.create({ data: { householdId: m.householdId, userId: m.userId, action: "CREATE", entity: "Transaction", entityId: t.id } });
    }
    await tx.auditLog.create({ data: { householdId: m.householdId, userId: m.userId, action: "MP_BASE", entity: "MpConnection", entityId: c.id } });
  });
  await syncMpBalance(c.id);
  revalidatePath("/", "layout");
  redirect(`${back}?ok=${diff === 0n ? "base" : diff > 0n ? "ajuste-mas" : "ajuste-menos"}`);
}

/** "Sincronizar": vuelve a sumar los pagos aprobados desde el saldo inicial. */
export async function refreshMpBalance(fd: FormData) {
  const { c, back } = await ownConnection(fd);
  await syncMpBalance(c.id);
  revalidatePath("/", "layout");
  redirect(`${back}?ok=saldo`);
}
