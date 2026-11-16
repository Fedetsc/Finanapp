// Cookie temporal del OAuth de Mercado Pago: guarda el "state" (contra CSRF) y la cuenta a vincular.
import { timingSafeEqual } from "node:crypto";

export const MP_OAUTH_COOKIE = "mp_oauth";
export const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/api/mp", maxAge: 600 };

/** "state.accountId" -> partes. */
export function readOAuthCookie(v: string | undefined) {
  const [state, accountId] = (v ?? "").split(".");
  return state && accountId ? { state, accountId } : null;
}

export function sameState(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
