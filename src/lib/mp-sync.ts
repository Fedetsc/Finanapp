// Lectura del saldo real de Mercado Pago (solo lectura). SOLO servidor.
import { db } from "./db";
import { mpGet, MpError, type MpResult } from "./mp";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});

/** Monto de Mercado Pago (número o texto con punto decimal, en pesos) -> centavos. */
export function toCentsMp(v: unknown): bigint | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isFinite(n) ? BigInt(Math.round(n * 100)) : null;
}

/**
 * Saldo de la respuesta de /v1/account/balance. Usamos el disponible (lo que muestra la app de Mercado Pago);
 * si no viene, el total.
 */
export function parseBalance(body: unknown): { cents: bigint; currency: string } | null {
  const b = obj(body);
  const cents = toCentsMp(b.available_balance) ?? toCentsMp(b.total_amount);
  if (cents === null) return null;
  return { cents, currency: typeof b.currency_id === "string" ? b.currency_id.toUpperCase() : "ARS" };
}

/** ¿El usuario de Mercado Pago es de prueba? (/users/me trae la etiqueta "test_user"). */
export function isTestUser(body: unknown) {
  const tags = obj(body).tags;
  return Array.isArray(tags) && tags.includes("test_user");
}

const errorOf = (r: MpResult) =>
  r.status === 404 ? "Mercado Pago no expone el saldo para esta cuenta (404)."
  : r.status === 401 || r.status === 403 ? `Mercado Pago no dio permiso para leer el saldo (${r.status}).`
  : r.error ?? `Mercado Pago respondió ${r.status ?? "sin respuesta"} al pedir el saldo.`;

/**
 * Lee el saldo y lo guarda en la vinculación. Nunca lanza: si falla, guarda el motivo en syncError.
 * `checkTestUser` (al vincular) confirma con /users/me si el usuario es de prueba.
 */
export async function syncMpBalance(connectionId: string, opts: { checkTestUser?: boolean } = {}) {
  const conn = await db.mpConnection.findUnique({ where: { id: connectionId }, select: { id: true, accessTokenEnc: true, refreshTokenEnc: true, expiresAt: true, liveMode: true } });
  if (!conn) return;
  try {
    let liveMode = conn.liveMode;
    if (opts.checkTestUser) {
      const me = await mpGet(conn, "/users/me");
      if (me.ok && isTestUser(me.body)) liveMode = false;
    }
    const r = await mpGet(conn, "/v1/account/balance");
    const bal = r.ok ? parseBalance(r.body) : null;
    await db.mpConnection.update({
      where: { id: conn.id },
      data: bal
        ? { liveMode, balance: bal.cents, balanceCurrency: bal.currency, lastSyncAt: new Date(), syncError: null }
        : { liveMode, syncError: r.ok ? "Mercado Pago respondió sin un saldo reconocible." : errorOf(r) },
    });
  } catch (e) {
    // Solo el tipo de error: nunca tokens ni la respuesta.
    if (!(e instanceof MpError)) console.error("[mp sync]", e instanceof Error ? e.name : "error");
    await db.mpConnection.update({ where: { id: conn.id }, data: { syncError: e instanceof MpError ? e.message : "No se pudo leer el saldo." } }).catch(() => {});
  }
}
