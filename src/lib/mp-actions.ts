"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "./db";
import { requireMember } from "./session";

/**
 * Desvincula la cuenta: borra los tokens guardados. La cuenta vuelve a ser manual.
 * (El permiso también se puede revocar desde Mercado Pago > Seguridad > Aplicaciones conectadas.)
 */
export async function unlinkMp(fd: FormData) {
  const m = await requireMember();
  const accountId = String(fd.get("accountId") ?? "");
  const c = await db.mpConnection.findFirst({ where: { accountId, householdId: m.householdId }, select: { id: true, memberId: true } });
  if (!c) redirect(`/cuentas/${encodeURIComponent(accountId)}/mercadopago`);
  if (c.memberId !== m.id) redirect(`/cuentas/${encodeURIComponent(accountId)}/mercadopago?e=${encodeURIComponent("Solo quien la vinculó la puede desvincular")}`);
  await db.$transaction([
    db.mpConnection.delete({ where: { id: c.id } }),
    db.auditLog.create({ data: { householdId: m.householdId, userId: m.userId, action: "UNLINK", entity: "MpConnection", entityId: c.id } }),
  ]);
  revalidatePath("/cuentas", "layout");
  redirect(`/cuentas/${encodeURIComponent(accountId)}/mercadopago?ok=desvinculada`);
}
