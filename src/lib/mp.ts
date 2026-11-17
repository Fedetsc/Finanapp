// Cliente de la API de Mercado Pago. SOLO servidor: los tokens se descifran acá y nunca se devuelven ni se loguean.
import { db } from "./db";
import { decryptToken, encryptToken } from "./mp-crypto";

const API = "https://api.mercadopago.com";
const AUTH = "https://auth.mercadopago.com.ar/authorization";
/** Renovamos el token si vence en menos de 7 días (dura 180). */
const REFRESH_BEFORE_MS = 7 * 24 * 3600 * 1000;

/** Cuentas que se pueden vincular: las que se llaman "Mercado Pago" (la app no tiene un campo de proveedor). */
export const isMpAccount = (name: string) => /mercado\s*pago/i.test(name);

/** Error de Mercado Pago con un mensaje que se puede mostrar (nunca incluye tokens). */
export class MpError extends Error {
  constructor(message: string, public status: number | null = null) { super(message); }
}

function config() {
  const clientId = process.env.MP_CLIENT_ID, clientSecret = process.env.MP_CLIENT_SECRET, redirectUri = process.env.MP_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) throw new MpError("Falta configurar MP_CLIENT_ID, MP_CLIENT_SECRET o MP_REDIRECT_URI");
  return { clientId, clientSecret, redirectUri };
}

/** URL de autorización de Mercado Pago (el usuario acepta allá y vuelve a /api/mp/callback). */
export function authorizationUrl(state: string) {
  const { clientId, redirectUri } = config();
  const q = new URLSearchParams({ client_id: clientId, response_type: "code", platform_id: "mp", state, redirect_uri: redirectUri });
  return `${AUTH}?${q}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number; user_id: number | string; live_mode?: boolean };

/** POST /oauth/token. Solo devuelve un mensaje genérico si falla (la respuesta de error no se loguea completa). */
async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const r = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const j = (await r.json().catch(() => ({}))) as Partial<TokenResponse> & { error?: string; message?: string };
  if (!r.ok || !j.access_token || !j.user_id) {
    console.error("[mp oauth]", r.status, String(j.error ?? "").slice(0, 60)); // solo estado y código de error
    throw new MpError(r.status === 400 ? "Mercado Pago rechazó la autorización (código vencido o mal configurado). Probá vincular de nuevo." : "No se pudo conectar con Mercado Pago.", r.status);
  }
  return j as TokenResponse;
}

export function exchangeCode(code: string) {
  const { clientId, clientSecret, redirectUri } = config();
  return tokenRequest({ grant_type: "authorization_code", client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri });
}

/** Credenciales de prueba: Mercado Pago devuelve live_mode=false o tokens que empiezan con TEST-. */
export const isLiveToken = (t: Pick<TokenResponse, "access_token" | "live_mode">) => t.live_mode !== false && !t.access_token.startsWith("TEST-");

/** Datos cifrados listos para guardar en MpConnection. */
export function sealTokens(t: TokenResponse) {
  return {
    liveMode: isLiveToken(t),
    mpUserId: String(t.user_id),
    accessTokenEnc: encryptToken(t.access_token),
    refreshTokenEnc: t.refresh_token ? encryptToken(t.refresh_token) : null,
    expiresAt: new Date(Date.now() + Math.max(60, Number(t.expires_in) || 0) * 1000),
  };
}

type Conn = { id: string; accessTokenEnc: string; refreshTokenEnc: string | null; expiresAt: Date };

/** Renueva con el refresh_token (se usa una sola vez: se guarda el nuevo). No le pide nada al usuario. */
async function refresh(conn: Conn): Promise<string> {
  if (!conn.refreshTokenEnc) throw new MpError("La vinculación venció. Desvinculá y volvé a vincular.", 401);
  const { clientId, clientSecret } = config();
  const t = await tokenRequest({ grant_type: "refresh_token", client_id: clientId, client_secret: clientSecret, refresh_token: decryptToken(conn.refreshTokenEnc) });
  const sealed = sealTokens(t);
  await db.mpConnection.update({ where: { id: conn.id }, data: { accessTokenEnc: sealed.accessTokenEnc, refreshTokenEnc: sealed.refreshTokenEnc ?? conn.refreshTokenEnc, expiresAt: sealed.expiresAt } });
  conn.accessTokenEnc = sealed.accessTokenEnc;
  conn.expiresAt = sealed.expiresAt;
  return t.access_token;
}

async function validToken(conn: Conn): Promise<string> {
  if (conn.expiresAt.getTime() - Date.now() < REFRESH_BEFORE_MS) return refresh(conn);
  return decryptToken(conn.accessTokenEnc);
}

export type MpResult = { status: number | null; ok: boolean; body: unknown; error?: string };

/**
 * GET autenticado a la API (host de Mercado Pago o, para pruebas, de Mercado Libre).
 * Si responde 401 renueva el token una vez y reintenta. Nunca lanza por errores HTTP: devuelve el estado.
 */
export async function mpGet(conn: Conn, url: string): Promise<MpResult> {
  const full = url.startsWith("http") ? url : `${API}${url}`;
  if (!/^https:\/\/api\.(mercadopago|mercadolibre)\.com\//.test(full)) throw new MpError("Host no permitido");
  const call = async (token: string) => {
    try {
      const r = await fetch(full, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
      return { status: r.status, ok: r.ok, body: await r.json().catch(() => null) } as MpResult;
    } catch (e) {
      return { status: null, ok: false, body: null, error: e instanceof Error && e.name === "TimeoutError" ? "Tardó demasiado" : "Sin respuesta" } as MpResult;
    }
  };
  let r = await call(await validToken(conn));
  if (r.status === 401 && conn.refreshTokenEnc) r = await call(await refresh(conn));
  return r;
}
