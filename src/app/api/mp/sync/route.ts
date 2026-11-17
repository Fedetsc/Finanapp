import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { syncHousehold } from "@/lib/mp-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Auto-sync al abrir Inicio o Cuentas: sincroniza las cuentas de Mercado Pago del hogar
 * que no se sincronizaron en los últimos 2 minutos. Idempotente: llamarla de más no duplica nada.
 */
async function handle() {
  const m = await requireMember();
  const ran = await syncHousehold(m.householdId);
  const conns = await db.mpConnection.findMany({ where: { householdId: m.householdId }, select: { lastSyncAt: true } });
  const pending = await db.pendingMovement.count({ where: { householdId: m.householdId, status: "PENDING" } });
  const last = conns.map((c) => c.lastSyncAt?.getTime() ?? 0).reduce((a, b) => Math.max(a, b), 0);
  return NextResponse.json({ ran, lastSyncAt: last ? new Date(last).toISOString() : null, pending }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = handle;
export const POST = handle;
