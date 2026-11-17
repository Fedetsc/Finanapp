import { NextResponse } from "next/server";
import { validSignature } from "@/lib/mp-webhook";
import { syncByMpUser } from "@/lib/mp-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});

/**
 * Webhook de Mercado Pago (Tus integraciones > Webhooks, evento "Pagos"):
 * valida la firma con MP_WEBHOOK_SECRET y sincroniza la cuenta del usuario del pago.
 * No confía en el contenido de la notificación: vuelve a consultar los pagos con la API.
 * Si la sincronización falla responde 200 igual (el auto-sync o el cron lo toman después).
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const body = obj(await req.json().catch(() => ({})));
  const dataId = url.searchParams.get("data.id") ?? (obj(body.data).id === undefined ? null : String(obj(body.data).id));
  const ok = validSignature({ header: req.headers.get("x-signature"), requestId: req.headers.get("x-request-id"), dataId, secret: process.env.MP_WEBHOOK_SECRET });
  if (!ok) return NextResponse.json({ error: "Firma inválida" }, { status: 401 });

  const type = String(body.type ?? body.topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "");
  const userId = body.user_id === undefined || body.user_id === null ? null : String(body.user_id);
  if (type === "payment" && userId && /^\d+$/.test(userId)) {
    try { await syncByMpUser(userId); }
    catch (e) { console.error("[mp webhook]", e instanceof Error ? e.name : "error"); }
  }
  return NextResponse.json({ ok: true });
}
