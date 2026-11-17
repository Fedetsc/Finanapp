"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "./db";
import { requireMember } from "./session";
import { syncMpBalance } from "./mp-sync";
import { toCents } from "./util";

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

/** Saldo inicial: lo que el usuario ve hoy en la app de Mercado Pago. Desde este momento se suman los pagos. */
export async function setMpBase(fd: FormData) {
  const { m, c, back } = await ownConnection(fd);
  let cents: bigint;
  try { cents = toCents(String(fd.get("base") ?? "").replace("$", "")); } catch { redirect(`${back}?e=${encodeURIComponent("Escribí el saldo, por ejemplo 125.000,50")}#saldo-inicial`); }
  if (cents < 0n) redirect(`${back}?e=${encodeURIComponent("El saldo no puede ser negativo")}#saldo-inicial`);
  await db.$transaction([
    db.mpConnection.update({ where: { id: c.id }, data: { baseBalance: cents, baseAt: new Date(), balance: cents, balanceCurrency: null, lastSyncAt: null, syncError: null } }),
    db.auditLog.create({ data: { householdId: m.householdId, userId: m.userId, action: "MP_BASE", entity: "MpConnection", entityId: c.id } }),
  ]);
  await syncMpBalance(c.id);
  revalidatePath("/", "layout");
  redirect(`${back}?ok=base`);
}

/** "Sincronizar": vuelve a sumar los pagos aprobados desde el saldo inicial. */
export async function refreshMpBalance(fd: FormData) {
  const { c, back } = await ownConnection(fd);
  await syncMpBalance(c.id);
  revalidatePath("/", "layout");
  redirect(`${back}?ok=saldo`);
}
