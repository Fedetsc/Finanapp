import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { syncAllConnections } from "@/lib/mp-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Respaldo del webhook: sincroniza todas las cuentas de Mercado Pago que no se sincronizaron en 10 minutos.
 * Lo puede llamar el cron de Vercel o uno externo (cron-job.org) con "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req.headers.get("authorization"))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await syncAllConnections()) });
  } catch (e) {
    console.error("[cron mp-sync]", e instanceof Error ? e.name : "error");
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
