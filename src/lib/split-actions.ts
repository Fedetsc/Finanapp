"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { requireMember, type SessionMember } from "./session";
import { fail } from "./action";
import { fmt, parseDate, toCents, todayAR } from "./util";
import { amountShares, equalShares, pendingDebts, percentShares, readShares, writeShares, type Shares } from "./split-math";
import { quickAdd } from "./quick-actions";

// División de gastos: es una calculadora aparte. Nada de acá crea movimientos del hogar,
// salvo moveToMovements (botón opcional "Pasar a movimientos"), que usa la misma alta que Inicio.

const LIST = "/hogar/division";
const detail = (id: string) => `${LIST}/${id}`;
const Name = z.string().trim().min(1, "Poné un nombre").max(40, "El nombre es muy largo");
const sameName = (a: string, b: string) => a.localeCompare(b, "es", { sensitivity: "base" }) === 0;

/** División del hogar actual (si no es de este hogar, no existe). */
async function ownGroup(id: string, m: SessionMember) {
  const g = await db.splitGroup.findFirst({ where: { id, householdId: m.householdId }, select: { id: true, currency: true, title: true } });
  if (!g) throw new Error("No se encontró la división");
  return g;
}
const audit = (m: SessionMember, action: string, entity: string, entityId: string) =>
  db.auditLog.create({ data: { householdId: m.householdId, userId: m.userId, action, entity, entityId } });
const friendly = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" ? new Error("Ya hay alguien con ese nombre en la división") : e;
/** Recalcula el estado: sin deudas pendientes y con gastos = Saldado. */
async function refreshStatus(groupId: string) {
  const g = await db.splitGroup.findUnique({ where: { id: groupId }, select: { participants: { select: { id: true } }, expenses: { select: { paidByParticipantId: true, amount: true, splitDetails: true } }, settlements: { select: { fromParticipantId: true, toParticipantId: true, amount: true } } } });
  if (!g) return;
  const pending = pendingDebts(g.participants.map((p) => p.id), g.expenses.map(toExp), g.settlements.map(toDebt));
  await db.splitGroup.update({ where: { id: groupId }, data: { status: g.expenses.length && !pending.length ? "SETTLED" : "ACTIVE" } });
}
const toExp = (e: { paidByParticipantId: string; amount: bigint; splitDetails: Prisma.JsonValue }) => ({ paidBy: e.paidByParticipantId, amount: e.amount, shares: readShares(e.splitDetails) });
const toDebt = (s: { fromParticipantId: string; toParticipantId: string; amount: bigint }) => ({ from: s.fromParticipantId, to: s.toParticipantId, amount: s.amount });
const done = (path: string) => { revalidatePath(LIST, "layout"); redirect(path); };

/** Nueva división: título, moneda y participantes (miembros del hogar o nombres libres). */
export async function createGroup(fd: FormData) {
  const m = await requireMember();
  let id = "";
  try {
    const title = z.string().trim().min(1, "Poné un título").max(60, "El título es muy largo").parse(fd.get("title"));
    const currency = String(fd.get("currency") ?? "ARS");
    if (!/^[A-Z][A-Z_]{1,15}$/.test(currency)) throw new Error("Moneda inválida");
    const names = fd.getAll("pname").map((v) => Name.parse(v));
    const memberIds = fd.getAll("pmember").map(String);
    if (names.length < 2) throw new Error("Agregá al menos 2 personas");
    if (names.length > 30) throw new Error("Máximo 30 personas por división");
    if (names.some((n, i) => names.findIndex((x) => sameName(x, n)) !== i)) throw new Error("Hay dos personas con el mismo nombre");
    const valid = new Set((await db.member.findMany({ where: { householdId: m.householdId }, select: { id: true } })).map((x) => x.id));
    const g = await db.$transaction(async (tx) => {
      const g = await tx.splitGroup.create({ data: { householdId: m.householdId, title, currency, createdByMemberId: m.id } });
      await tx.splitParticipant.createMany({ data: names.map((name, i) => ({ householdId: m.householdId, groupId: g.id, name, memberId: valid.has(memberIds[i]) ? memberIds[i] : null })) });
      await tx.auditLog.create({ data: { householdId: m.householdId, userId: m.userId, action: "CREATE", entity: "SplitGroup", entityId: g.id } });
      return g;
    });
    id = g.id;
  } catch (e) { fail(`${LIST}/nueva`, friendly(e)); }
  done(detail(id));
}

/** Borra la división entera (sus gastos y pagos). No toca movimientos del hogar. */
export async function deleteGroup(fd: FormData) {
  const m = await requireMember();
  const id = String(fd.get("groupId") ?? "");
  try {
    const g = await ownGroup(id, m);
    await db.$transaction([db.splitGroup.delete({ where: { id: g.id } }), audit(m, "DELETE", "SplitGroup", g.id)]);
  } catch (e) { fail(detail(id), e); }
  done(`${LIST}?ok=borrada`);
}

/** Suma una persona a una división ya creada. Los gastos viejos no cambian. */
export async function addParticipant(fd: FormData) {
  const m = await requireMember();
  const id = String(fd.get("groupId") ?? "");
  try {
    const g = await ownGroup(id, m);
    const name = Name.parse(fd.get("name"));
    const others = await db.splitParticipant.findMany({ where: { groupId: g.id }, select: { name: true } });
    if (others.some((p) => sameName(p.name, name))) throw new Error("Ya hay alguien con ese nombre en la división");
    if (others.length >= 30) throw new Error("Máximo 30 personas por división");
    const member = await db.member.findFirst({ where: { householdId: m.householdId, id: String(fd.get("memberId") ?? "") }, select: { id: true } });
    await db.splitParticipant.create({ data: { householdId: m.householdId, groupId: g.id, name, memberId: member?.id ?? null } });
  } catch (e) { fail(detail(id), friendly(e)); }
  done(detail(id));
}

/** Saca a una persona solo si no participa de ningún gasto ni pago. */
export async function removeParticipant(fd: FormData) {
  const m = await requireMember();
  const id = String(fd.get("groupId") ?? "");
  try {
    const g = await ownGroup(id, m);
    const pid = String(fd.get("participantId") ?? "");
    const [exps, settles] = await Promise.all([
      db.splitExpense.findMany({ where: { groupId: g.id }, select: { paidByParticipantId: true, splitDetails: true } }),
      db.splitSettlement.count({ where: { groupId: g.id, OR: [{ fromParticipantId: pid }, { toParticipantId: pid }] } }),
    ]);
    if (settles || exps.some((e) => e.paidByParticipantId === pid || readShares(e.splitDetails)[pid] !== undefined)) throw new Error("No se puede sacar: participa de algún gasto o pago");
    await db.splitParticipant.deleteMany({ where: { id: pid, groupId: g.id } });
  } catch (e) { fail(detail(id), e); }
  done(detail(id));
}

/**
 * Alta o edición de un gasto. split = equal (entre los tildados) | percent (enteros que suman 100) | amount (suman el total).
 * La parte de cada uno queda guardada en splitDetails.
 */
export async function saveExpense(fd: FormData) {
  const m = await requireMember();
  const id = String(fd.get("groupId") ?? "");
  try {
    const g = await ownGroup(id, m);
    const description = z.string().trim().min(1, "Poné una descripción").max(80).parse(fd.get("description"));
    const amount = toCents(String(fd.get("amount") ?? ""));
    if (amount <= 0n) throw new Error("El monto tiene que ser mayor a cero");
    const date = parseDate(String(fd.get("date") || todayAR()));
    const people = await db.splitParticipant.findMany({ where: { groupId: g.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
    const payer = people.find((p) => p.id === fd.get("paidBy"));
    if (!payer) throw new Error("Elegí quién pagó");
    const mode = z.enum(["equal", "percent", "amount"]).parse(fd.get("split"));

    let shares: Shares;
    const input: Record<string, string> = {};
    if (mode === "equal") {
      shares = equalShares(amount, people.filter((p) => fd.get(`in_${p.id}`) === "on").map((p) => p.id));
    } else if (mode === "percent") {
      const pcts: Record<string, number> = {};
      for (const p of people) { const v = String(fd.get(`pct_${p.id}`) ?? "").trim() || "0"; if (!/^\d{1,3}$/.test(v)) throw new Error(`Porcentaje inválido para ${p.name}`); pcts[p.id] = Number(v); input[p.id] = v; }
      shares = percentShares(amount, pcts);
    } else {
      const amts: Record<string, bigint> = {};
      for (const p of people) { const v = String(fd.get(`amt_${p.id}`) ?? "").trim(); amts[p.id] = v ? toCents(v) : 0n; input[p.id] = v; }
      shares = amountShares(amount, amts);
    }
    const data = { description, amount, date, paidByParticipantId: payer.id, splitType: mode === "equal" ? "EQUAL" as const : "CUSTOM" as const, splitDetails: { mode, shares: writeShares(shares), input } };

    const expenseId = String(fd.get("id") ?? "");
    if (expenseId) {
      const prev = await db.splitExpense.findFirst({ where: { id: expenseId, groupId: g.id }, select: { id: true } });
      if (!prev) throw new Error("No se encontró el gasto");
      await db.$transaction([db.splitExpense.update({ where: { id: prev.id }, data }), audit(m, "UPDATE", "SplitExpense", prev.id)]);
    } else {
      await db.$transaction(async (tx) => {
        const e = await tx.splitExpense.create({ data: { ...data, householdId: m.householdId, groupId: g.id } });
        await tx.auditLog.create({ data: { householdId: m.householdId, userId: m.userId, action: "CREATE", entity: "SplitExpense", entityId: e.id } });
      });
    }
    await refreshStatus(g.id);
  } catch (e) { fail(detail(id), e); }
  done(`${detail(id)}?ok=gasto`);
}

export async function deleteExpense(fd: FormData) {
  const m = await requireMember();
  const id = String(fd.get("groupId") ?? "");
  try {
    const g = await ownGroup(id, m);
    const e = await db.splitExpense.findFirst({ where: { id: String(fd.get("id") ?? ""), groupId: g.id }, select: { id: true } });
    if (e) await db.$transaction([db.splitExpense.delete({ where: { id: e.id } }), audit(m, "DELETE", "SplitExpense", e.id)]);
    await refreshStatus(g.id);
  } catch (err) { fail(detail(id), err); }
  done(detail(id));
}

/** Pendientes actuales de la división (recalculados en el servidor: nunca se confía en el monto del form). */
async function pendingOf(groupId: string) {
  const g = await db.splitGroup.findUniqueOrThrow({ where: { id: groupId }, select: { participants: { orderBy: { createdAt: "asc" }, select: { id: true } }, expenses: { select: { paidByParticipantId: true, amount: true, splitDetails: true } }, settlements: { select: { fromParticipantId: true, toParticipantId: true, amount: true } } } });
  return pendingDebts(g.participants.map((p) => p.id), g.expenses.map(toExp), g.settlements.map(toDebt));
}

/** "Marcar como saldado": registra el pago de una deuda pendiente. Queda en el historial. */
export async function settleDebt(fd: FormData) {
  const m = await requireMember();
  const id = String(fd.get("groupId") ?? "");
  try {
    const g = await ownGroup(id, m);
    const from = String(fd.get("from") ?? ""), to = String(fd.get("to") ?? "");
    const debt = (await pendingOf(g.id)).find((d) => d.from === from && d.to === to);
    if (!debt) throw new Error("Esa deuda ya no está pendiente. Recargá la página.");
    await db.$transaction(async (tx) => {
      const s = await tx.splitSettlement.create({ data: { householdId: m.householdId, groupId: g.id, fromParticipantId: from, toParticipantId: to, amount: debt.amount } });
      await tx.auditLog.create({ data: { householdId: m.householdId, userId: m.userId, action: "CREATE", entity: "SplitSettlement", entityId: s.id } });
    });
    await refreshStatus(g.id);
  } catch (e) { fail(detail(id), e); }
  done(`${detail(id)}?ok=saldada`);
}

/** "Saldar todo": registra todas las deudas pendientes y deja la división como Saldada. */
export async function settleAll(fd: FormData) {
  const m = await requireMember();
  const id = String(fd.get("groupId") ?? "");
  try {
    const g = await ownGroup(id, m);
    const debts = await pendingOf(g.id);
    if (!debts.length) throw new Error("No hay deudas pendientes");
    await db.$transaction([
      db.splitSettlement.createMany({ data: debts.map((d) => ({ householdId: m.householdId, groupId: g.id, fromParticipantId: d.from, toParticipantId: d.to, amount: d.amount })) }),
      audit(m, "SETTLE_ALL", "SplitGroup", g.id),
    ]);
    await refreshStatus(g.id);
  } catch (e) { fail(detail(id), e); }
  done(`${detail(id)}?ok=saldada`);
}

/** Deshace un pago del historial (la deuda vuelve a pendientes). */
export async function undoSettlement(fd: FormData) {
  const m = await requireMember();
  const id = String(fd.get("groupId") ?? "");
  try {
    const g = await ownGroup(id, m);
    const s = await db.splitSettlement.findFirst({ where: { id: String(fd.get("id") ?? ""), groupId: g.id }, select: { id: true } });
    if (s) await db.$transaction([db.splitSettlement.delete({ where: { id: s.id } }), audit(m, "DELETE", "SplitSettlement", s.id)]);
    await refreshStatus(g.id);
  } catch (e) { fail(detail(id), e); }
  done(detail(id));
}

/**
 * OPCIONAL: pasa un gasto que pagué yo a los movimientos reales del hogar (gasto por el monto total, fecha de hoy,
 * en una cuenta mía de la misma moneda). Usa la misma alta que el botón "Gastos" de Inicio. Solo una vez por gasto.
 */
export async function moveToMovements(fd: FormData) {
  const m = await requireMember();
  const id = String(fd.get("groupId") ?? "");
  try {
    const g = await ownGroup(id, m);
    const e = await db.splitExpense.findFirst({ where: { id: String(fd.get("id") ?? ""), groupId: g.id }, select: { id: true, amount: true, description: true, movedTransactionId: true, paidBy: { select: { memberId: true } } } });
    if (!e) throw new Error("No se encontró el gasto");
    if (e.movedTransactionId) throw new Error("Ese gasto ya está en los movimientos del hogar");
    if (e.paidBy.memberId !== m.id) throw new Error("Solo podés pasar a movimientos los gastos que pagaste vos");
    const acc = await db.account.findFirst({ where: { id: String(fd.get("accountId") ?? ""), householdId: m.householdId, ownerMemberId: m.id }, select: { id: true, currency: true } });
    if (!acc) throw new Error("Elegí una cuenta tuya");
    if (acc.currency !== g.currency) throw new Error("La cuenta tiene que estar en la misma moneda que la división");
    const q = new FormData();
    q.set("type", "EXPENSE");
    q.set("amount", fmt(e.amount).slice(1)); // "30.000,00", el formato que entiende toCents
    q.set("accountId", acc.id);
    q.set("description", `${g.title}: ${e.description}`.slice(0, 120));
    const r = await quickAdd(q);
    if (!r.ok) throw new Error(r.error);
    await db.splitExpense.update({ where: { id: e.id }, data: { movedTransactionId: r.id } });
  } catch (err) { fail(detail(id), err); }
  done(`${detail(id)}?ok=movido`);
}
