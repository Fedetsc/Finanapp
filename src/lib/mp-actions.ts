"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "./db";
import { requireMember } from "./session";
import { syncMpBalance } from "./mp-sync";
import { parseDate, toCents } from "./util";
import type { Prisma } from "@prisma/client";
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

export type PendingResult = { ok: true } | { ok: false; error: string };
const AR_DAY = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

/**
 * Categoriza un movimiento traído de Mercado Pago (solo el dueño de la cuenta).
 * mode: "category" -> ingreso (si entró) o gasto (si salió) con la categoría elegida;
 *       "transfer" -> transferencia entre mis cuentas (entra desde / sale hacia la cuenta elegida);
 *       "ignore"   -> no se registra nada.
 * Idempotente: el pendiente pasa a DONE en la misma transacción; si ya estaba resuelto, no crea nada.
 * El saldo de la cuenta de Mercado Pago no cambia (ya es el de Mercado Pago).
 */
export async function resolvePending(fd: FormData): Promise<PendingResult> {
  const m = await requireMember();
  const id = String(fd.get("id") ?? ""), mode = String(fd.get("mode") ?? "");
  const p = await db.pendingMovement.findFirst({ where: { id, householdId: m.householdId }, include: { account: { select: { id: true, ownerMemberId: true, currency: true } } } });
  if (!p) return { ok: false, error: "No se encontró el movimiento" };
  if (p.account.ownerMemberId !== m.id) return { ok: false, error: "Solo el dueño de la cuenta lo puede categorizar" };
  if (p.status !== "PENDING") return { ok: true };

  let data: Prisma.TransactionUncheckedCreateInput | null = null;
  const date = parseDate(AR_DAY(p.occurredAt));
  const base = { householdId: m.householdId, memberId: m.id, amount: p.amount, date };
  if (mode === "category") {
    const type = p.direction === "IN" ? "INCOME" : "EXPENSE";
    const catId = String(fd.get("categoryId") ?? "");
    const cat = catId
      ? await db.category.findFirst({ where: { id: catId, householdId: m.householdId }, select: { id: true } })
      : { id: await systemCategory(db, m.householdId, type === "INCOME" ? "Ingresos Varios" : "Gastos Varios") };
    if (!cat) return { ok: false, error: "Elegí una categoría" };
    data = { ...base, type, accountId: p.accountId, categoryId: cat.id, description: (p.counterpart ? `${p.direction === "IN" ? "De" : "A"} ${p.counterpart}` : p.description ?? "Mercado Pago").slice(0, 120) };
  } else if (mode === "transfer") {
    const other = await db.account.findFirst({ where: { id: String(fd.get("accountId") ?? ""), householdId: m.householdId, ownerMemberId: m.id, currency: p.currency }, select: { id: true } });
    if (!other || other.id === p.accountId) return { ok: false, error: "Elegí otra cuenta tuya en la misma moneda" };
    const [from, to] = p.direction === "IN" ? [other.id, p.accountId] : [p.accountId, other.id];
    data = { ...base, type: "TRANSFER", accountId: from, toAccountId: to, toAmount: p.amount, description: "Transferencia (Mercado Pago)" };
  } else if (mode !== "ignore") {
    return { ok: false, error: "Elegí qué fue" };
  }

  await db.$transaction(async (tx) => {
    const claimed = await tx.pendingMovement.updateMany({ where: { id: p.id, status: "PENDING" }, data: { status: data ? "DONE" : "DISMISSED", resolvedAt: new Date() } });
    if (claimed.count !== 1 || !data) return; // ya resuelto por otro toque, o ignorado
    const t = await tx.transaction.create({ data });
    await tx.pendingMovement.update({ where: { id: p.id }, data: { transactionId: t.id } });
    await tx.auditLog.create({ data: { householdId: m.householdId, userId: m.userId, action: "CREATE", entity: "Transaction", entityId: t.id } });
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
