// Saldo de una cuenta vinculada con Mercado Pago. SOLO servidor.
// La API oficial no tiene un endpoint de saldo, así que el saldo es:
//   saldo inicial (lo carga el usuario al vincular) + pagos aprobados desde ese momento (GET /v1/payments/search).
import { db } from "./db";
import { mpGet, MpError, type MpResult } from "./mp";

type Obj = Record<string, unknown>;
type Conn = Parameters<typeof mpGet>[0];
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const idOf = (v: unknown) => { const x = obj(v).id; return x === undefined || x === null ? null : String(x); };

/** Monto de Mercado Pago (número o texto con punto decimal, en pesos) -> centavos. */
export function toCentsMp(v: unknown): bigint | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isFinite(n) ? BigInt(Math.round(n * 100)) : null;
}

/** ¿El usuario de Mercado Pago es de prueba? (/users/me trae la etiqueta "test_user"). */
export function isTestUser(body: unknown) {
  const tags = obj(body).tags;
  return Array.isArray(tags) && tags.includes("test_user");
}

/**
 * Cuánto mueve un pago el saldo de `me` (centavos), o null si no cuenta.
 * Solo pagos aprobados, en la moneda de la cuenta y aprobados desde `since`.
 * Cobré: + lo que me quedó neto (net_received_amount). Pagué: − lo que pagué (total_paid_amount).
 */
export function paymentDelta(p: unknown, me: string, currency: string, since: Date): bigint | null {
  const x = obj(p);
  if (x.status !== "approved") return null;
  if (typeof x.currency_id === "string" && x.currency_id.toUpperCase() !== currency) return null;
  const approved = Date.parse(String(x.date_approved ?? x.date_created ?? ""));
  if (!Number.isFinite(approved) || approved < since.getTime()) return null;
  const det = obj(x.transaction_details);
  const collector = idOf(x.collector) ?? (x.collector_id === undefined || x.collector_id === null ? null : String(x.collector_id));
  const payer = idOf(x.payer);
  if (collector === me && payer === me) return 0n;
  if (collector === me) return toCentsMp(det.net_received_amount) ?? toCentsMp(x.transaction_amount);
  if (payer === me) { const v = toCentsMp(det.total_paid_amount) ?? toCentsMp(x.transaction_amount); return v === null ? null : -v; }
  return null;
}

const PAGE = 100, MAX_PAGES = 20;

/** Busca pagos (paginado) con un filtro. Devuelve los resultados o el primer error. */
async function searchAll(conn: Conn, filter: string, since: Date): Promise<{ results: unknown[]; error?: MpResult }> {
  const results: unknown[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const q = new URLSearchParams({ sort: "date_created", criteria: "asc", range: "date_created", begin_date: since.toISOString(), end_date: "NOW", limit: String(PAGE), offset: String(page * PAGE) });
    const r = await mpGet(conn, `/v1/payments/search?${q}&${filter}`);
    if (!r.ok) return { results, error: r };
    const b = obj(r.body);
    const got = Array.isArray(b.results) ? b.results : [];
    results.push(...got);
    const total = Number(obj(b.paging).total);
    if (got.length < PAGE || (Number.isFinite(total) && results.length >= total)) break;
  }
  return { results };
}

export type Counted = { payment: unknown; delta: bigint };
export type BalanceCalc = { ok: true; balance: bigint; base: bigint; delta: bigint; count: number; items: Counted[] } | { ok: false; error: string; failed?: MpResult };

/** Calcula el saldo (no guarda nada). */
export async function computeMpBalance(conn: Conn & { mpUserId: string; baseBalance: bigint | null; baseAt: Date | null }, currency: string): Promise<BalanceCalc> {
  if (conn.baseBalance === null || !conn.baseAt) return { ok: false, error: "Falta cargar el saldo inicial." };
  const me = conn.mpUserId;
  const [cobros, pagos] = await Promise.all([searchAll(conn, `collector.id=${me}`, conn.baseAt), searchAll(conn, `payer.id=${me}`, conn.baseAt)]);
  const failed = cobros.error ?? pagos.error;
  if (failed) return { ok: false, error: `Mercado Pago respondió ${failed.status ?? "sin respuesta"} al buscar pagos.`, failed };
  const seen = new Set<string>();
  const items: Counted[] = [];
  let delta = 0n;
  for (const p of [...cobros.results, ...pagos.results]) {
    const id = String(obj(p).id ?? "");
    if (!id || seen.has(id)) continue; // el mismo pago puede venir en las dos búsquedas
    seen.add(id);
    const d = paymentDelta(p, me, currency, conn.baseAt);
    if (d === null) continue;
    delta += d;
    items.push({ payment: p, delta: d });
  }
  return { ok: true, balance: conn.baseBalance + delta, base: conn.baseBalance, delta, count: items.length, items };
}

const name = (v: unknown) => { const o = obj(v); const n = [o.first_name, o.last_name].filter((x) => typeof x === "string" && x.trim()).join(" ").trim(); return n ? n.slice(0, 60) : null; };

/** Datos del pendiente a partir de un pago contado en el saldo. */
export function pendingFrom(p: unknown, delta: bigint) {
  const x = obj(p);
  const op = String(x.operation_type ?? "");
  const desc = typeof x.description === "string" && x.description.trim() ? x.description.trim().slice(0, 120) : null;
  return {
    mpPaymentId: String(x.id),
    direction: delta > 0n ? ("IN" as const) : ("OUT" as const),
    // money_transfer: envío de dinero entre cuentas; account_fund: ingreso de dinero a la cuenta.
    kind: op === "money_transfer" || op === "account_fund" ? "TRANSFER" : "PAYMENT",
    amount: delta > 0n ? delta : -delta,
    description: desc,
    counterpart: delta > 0n ? name(x.payer) ?? name(obj(obj(x.additional_info).payer)) : null,
    occurredAt: new Date(Date.parse(String(x.date_approved ?? x.date_created))),
  };
}

const CONN_SELECT = { id: true, householdId: true, accountId: true, mpUserId: true, accessTokenEnc: true, refreshTokenEnc: true, expiresAt: true, baseBalance: true, baseAt: true, account: { select: { currency: true } } } as const;

/**
 * Sincroniza una vinculación: recalcula el saldo (saldo inicial + pagos) y crea un pendiente por cada pago nuevo.
 * Idempotente: el saldo se recalcula entero y los pendientes son únicos por (cuenta, mpPaymentId), así que
 * sincronizar dos veces (o webhook + cron a la vez) no duplica nada. Nunca lanza: si falla, guarda el motivo.
 */
export async function syncMpBalance(connectionId: string): Promise<BalanceCalc | null> {
  const conn = await db.mpConnection.findUnique({ where: { id: connectionId }, select: CONN_SELECT });
  if (!conn) return null;
  await db.mpConnection.update({ where: { id: conn.id }, data: { lastAttemptAt: new Date() } });
  const currency = conn.account.currency;
  try {
    const r = await computeMpBalance(conn, currency);
    if (!r.ok) { await db.mpConnection.update({ where: { id: conn.id }, data: { syncError: r.error } }); return r; }
    const pend = r.items.filter((i) => i.delta !== 0n).map((i) => ({ ...pendingFrom(i.payment, i.delta), householdId: conn.householdId, accountId: conn.accountId, connectionId: conn.id, currency }));
    await db.$transaction([
      db.pendingMovement.createMany({ data: pend.filter((x) => !Number.isNaN(x.occurredAt.getTime())), skipDuplicates: true }),
      db.mpConnection.update({ where: { id: conn.id }, data: { balance: r.balance, balanceCurrency: currency, lastSyncAt: new Date(), syncError: null } }),
    ]);
    return r;
  } catch (e) {
    // Solo el tipo de error: nunca tokens ni la respuesta.
    if (!(e instanceof MpError)) console.error("[mp sync]", e instanceof Error ? e.name : "error");
    const error = e instanceof MpError ? e.message : "No se pudo calcular el saldo.";
    await db.mpConnection.update({ where: { id: conn.id }, data: { syncError: error } }).catch(() => {});
    return { ok: false, error };
  }
}

/** Vinculaciones que no se intentaron sincronizar en los últimos `minAgeMs` (null = todas las del filtro). */
async function stale(where: { householdId?: string; mpUserId?: string }, minAgeMs: number) {
  const before = new Date(Date.now() - minAgeMs);
  return db.mpConnection.findMany({
    where: { ...where, baseBalance: { not: null }, OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lt: before } }] },
    select: { id: true }, orderBy: { lastAttemptAt: { sort: "asc", nulls: "first" } }, take: 50,
  });
}

/** Al abrir Inicio/Cuentas: sincroniza las vinculaciones del hogar si pasaron más de 2 minutos. */
export const AUTO_SYNC_MS = 2 * 60 * 1000;
export async function syncHousehold(householdId: string) {
  const list = await stale({ householdId }, AUTO_SYNC_MS);
  for (const c of list) await syncMpBalance(c.id);
  return list.length;
}

/** Cron: todas las vinculaciones que no se sincronizaron en los últimos 10 minutos. */
export async function syncAllConnections() {
  const list = await stale({}, 10 * 60 * 1000);
  let synced = 0;
  for (const c of list) if ((await syncMpBalance(c.id))?.ok) synced++;
  return { checked: list.length, synced };
}

/** Webhook: sincroniza las vinculaciones del usuario de Mercado Pago (sin esperar los 2 minutos). */
export async function syncByMpUser(mpUserId: string) {
  const list = await db.mpConnection.findMany({ where: { mpUserId, baseBalance: { not: null } }, select: { id: true } });
  for (const c of list) await syncMpBalance(c.id);
  return list.length;
}

/** Al vincular: marca si el usuario de Mercado Pago es de prueba (no toca el saldo). */
export async function checkTestUser(connectionId: string) {
  const conn = await db.mpConnection.findUnique({ where: { id: connectionId }, select: { id: true, accessTokenEnc: true, refreshTokenEnc: true, expiresAt: true } });
  if (!conn) return;
  try {
    const me = await mpGet(conn, "/users/me");
    if (me.ok && isTestUser(me.body)) await db.mpConnection.update({ where: { id: conn.id }, data: { liveMode: false } });
  } catch { /* si no responde, queda como estaba */ }
}
