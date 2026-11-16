import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { authorizationUrl, isMpAccount, MpError } from "@/lib/mp";
import { MP_OAUTH_COOKIE, cookieOptions } from "../oauth-cookie";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Arranca la vinculación: valida que la cuenta sea mía y de Mercado Pago, y manda a autorizar a Mercado Pago. */
export async function GET(req: Request) {
  const m = await requireMember();
  const accountId = new URL(req.url).searchParams.get("accountId") ?? "";
  const back = (msg: string) => NextResponse.redirect(new URL(`/cuentas?e=${encodeURIComponent(msg)}`, req.url));
  const acc = await db.account.findFirst({ where: { id: accountId, householdId: m.householdId }, select: { id: true, name: true, ownerMemberId: true, mpConnection: { select: { id: true } } } });
  if (!acc) return back("No se encontró la cuenta");
  if (acc.ownerMemberId !== m.id) return back("Solo el dueño de la cuenta la puede vincular");
  if (!isMpAccount(acc.name)) return back("Solo se pueden vincular cuentas de Mercado Pago");
  if (acc.mpConnection) return NextResponse.redirect(new URL(`/cuentas/${acc.id}/mercadopago`, req.url));

  const state = randomBytes(24).toString("base64url");
  let url: string;
  try { url = authorizationUrl(state); } catch (e) { return back(e instanceof MpError ? e.message : "No se pudo iniciar la vinculación"); }
  const res = NextResponse.redirect(url);
  res.cookies.set(MP_OAUTH_COOKIE, `${state}.${acc.id}`, cookieOptions);
  return res;
}
