import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { exchangeCode, isMpAccount, MpError, sealTokens } from "@/lib/mp";
import { checkTestUser } from "@/lib/mp-sync";
import { MP_OAUTH_COOKIE, readOAuthCookie, sameState } from "../oauth-cookie";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Vuelta de Mercado Pago. Si MP_REDIRECT_URI apunta a la home, la home reenvía acá el ?code&state. Verifica el state, cambia el code por tokens y los guarda cifrados.
 * Los tokens no se devuelven ni se loguean.
 */
export async function GET(req: Request) {
  const m = await requireMember();
  const q = new URL(req.url).searchParams;
  const saved = readOAuthCookie(cookies().get(MP_OAUTH_COOKIE)?.value);
  const go = (path: string) => { const r = NextResponse.redirect(new URL(path, req.url)); r.cookies.delete({ name: MP_OAUTH_COOKIE, path: "/api/mp" }); return r; };
  const fail = (msg: string) => go(`/cuentas?e=${encodeURIComponent(msg)}`);

  if (!saved || !sameState(saved.state, q.get("state") ?? "")) return fail("La vinculación expiró o no es válida. Probá de nuevo.");
  if (q.get("error") || !q.get("code")) return fail("No se autorizó el acceso en Mercado Pago.");
  const acc = await db.account.findFirst({ where: { id: saved.accountId, householdId: m.householdId, ownerMemberId: m.id }, select: { id: true, name: true } });
  if (!acc || !isMpAccount(acc.name)) return fail("No se encontró la cuenta a vincular");

  let connId: string;
  try {
    const sealed = sealTokens(await exchangeCode(q.get("code")!));
    connId = await db.$transaction(async (tx) => {
      const c = await tx.mpConnection.upsert({ where: { accountId: acc.id }, update: { ...sealed, memberId: m.id, balance: null, balanceCurrency: null, lastSyncAt: null, syncError: null, baseBalance: null, baseAt: null }, create: { ...sealed, householdId: m.householdId, accountId: acc.id, memberId: m.id } });
      await tx.auditLog.create({ data: { householdId: m.householdId, userId: m.userId, action: "LINK", entity: "MpConnection", entityId: c.id } });
      return c.id;
    });
  } catch (e) {
    if (!(e instanceof MpError)) console.error("[mp callback]", e instanceof Error ? e.name : "error");
    return fail(e instanceof MpError ? e.message : "No se pudo guardar la vinculación.");
  }
  // Mercado Pago no tiene endpoint de saldo: el usuario carga el saldo inicial y se suman los pagos desde ahí.
  await checkTestUser(connId);
  return go(`/cuentas/${acc.id}/mercadopago?ok=vinculada#saldo-inicial`);
}
