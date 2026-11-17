// Datos para la barrita de Mercado Pago en Inicio y Cuentas (estado de sync + pendientes). SOLO servidor.
import { db } from "./db";
import { money } from "./currency";
import { AUTO_SYNC_MS } from "./mp-sync";

export type LivePending = { id: string; direction: "IN" | "OUT"; kind: string; amount: string; title: string; detail: string; date: string; accountId: string; accountName: string; currency: string };
export type MpLiveProps = {
  lastSyncAt: string | null; stale: boolean; error: string | null; needsBase: string | null;
  pendings: LivePending[]; categories: { id: string; name: string }[]; accounts: { id: string; name: string; currency: string }[];
};

const TITLE = { TRANSFER: { IN: "Transferencia entrante", OUT: "Transferencia enviada" }, PAYMENT: { IN: "Cobro", OUT: "Pago" } } as const;

/** null si el hogar no tiene ninguna cuenta vinculada con Mercado Pago. */
export async function mpLiveData(m: { id: string; householdId: string }): Promise<MpLiveProps | null> {
  const conns = await db.mpConnection.findMany({ where: { householdId: m.householdId }, select: { accountId: true, memberId: true, lastSyncAt: true, lastAttemptAt: true, syncError: true, baseBalance: true } });
  if (!conns.length) return null;
  const [pend, categories, accounts] = await Promise.all([
    db.pendingMovement.findMany({ where: { householdId: m.householdId, status: "PENDING", account: { ownerMemberId: m.id } }, orderBy: { occurredAt: "asc" }, take: 30, include: { account: { select: { name: true } } } }),
    db.category.findMany({ where: { householdId: m.householdId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.account.findMany({ where: { householdId: m.householdId, ownerMemberId: m.id }, orderBy: { name: "asc" }, select: { id: true, name: true, currency: true } }),
  ]);
  const now = Date.now();
  const last = conns.reduce((a, c) => Math.max(a, c.lastSyncAt?.getTime() ?? 0), 0);
  const tried = conns.reduce((a, c) => Math.min(a, c.lastAttemptAt?.getTime() ?? 0), Infinity);
  const mineNoBase = conns.find((c) => c.memberId === m.id && c.baseBalance === null);
  return {
    lastSyncAt: last ? new Date(last).toISOString() : null,
    stale: conns.some((c) => c.baseBalance !== null) && now - tried > AUTO_SYNC_MS,
    error: conns.find((c) => c.syncError && c.baseBalance !== null)?.syncError ?? null,
    needsBase: mineNoBase ? `/cuentas/${mineNoBase.accountId}/mercadopago#saldo-inicial` : null,
    pendings: pend.map((p) => {
      const t = (TITLE as Record<string, Record<string, string>>)[p.kind]?.[p.direction] ?? (p.direction === "IN" ? "Ingreso" : "Egreso");
      return {
        id: p.id, direction: p.direction, kind: p.kind, accountId: p.accountId, accountName: p.account.name, currency: p.currency,
        amount: `${p.direction === "IN" ? "+" : "−"}${money(p.amount, p.currency)}`,
        title: p.counterpart ? `${t} ${p.direction === "IN" ? "de" : "a"} ${p.counterpart}` : t,
        detail: p.description ?? "",
        date: p.occurredAt.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
      };
    }),
    categories,
    accounts,
  };
}
