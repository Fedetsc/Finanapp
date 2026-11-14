import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { accrueYields } from "@/lib/yields";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Compara en tiempo constante para no filtrar el secreto por timing. */
function authorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false; // sin CRON_SECRET configurado el endpoint queda cerrado
  const a = Buffer.from(header), b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Cron diario de Vercel (vercel.json, 03:30 UTC = 00:30 Argentina): acredita los rendimientos pendientes de todas las cuentas.
 * Vercel manda "Authorization: Bearer <CRON_SECRET>". Correrlo dos veces el mismo día no duplica nada.
 */
export async function GET(req: Request) {
  if (!authorized(req.headers.get("authorization"))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const r = await accrueYields();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("[cron accrue-yields]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
