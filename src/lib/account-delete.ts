"use server";
// Eliminar una cuenta (solo el dueño). Dos caminos cuando tiene movimientos:
//  - "move": pasa movimientos, ahorro, suscripciones, cuotas pagadas y el saldo inicial a otra cuenta tuya
//    de la misma moneda. Los saldos totales no cambian.
//  - "delete": borra la cuenta y sus movimientos. Las transferencias con otras cuentas también se borran
//    (eso cambia el saldo de esas cuentas). Si la cuenta tiene ahorro, suscripciones o cuotas de tarjeta
//    pagadas, no se permite: se descuadrarían los sobres, las suscripciones o las tarjetas.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "./db";
import { requireMember } from "./session";
import { deleteInfo, usage } from "./account-usage";
import { fail } from "./action";

export async function deleteAccount(fd: FormData) {
  const m = await requireMember();
  const id = String(fd.get("id") ?? "");
  const mode = String(fd.get("mode") ?? "");
  const back = `/cuentas/${encodeURIComponent(id)}`;
  try {
    const acc = await db.account.findUnique({ where: { id }, select: { id: true, householdId: true, ownerMemberId: true, currency: true, openingBalance: true } });
    if (!acc || acc.householdId !== m.householdId) throw new Error("Cuenta no encontrada");
    if (acc.ownerMemberId !== m.id) throw new Error("Solo el dueño de la cuenta la puede eliminar");
    const info = await deleteInfo(m.householdId, id);
    if (info.onlyAccount && info.balance !== 0n) throw new Error("Creá otra cuenta antes de eliminar esta");

    const [, savings, subs] = await usage(id);
    const hasAnything = info.txs > 0 || savings > 0 || subs > 0;

    await db.$transaction(async (tx) => {
      if (hasAnything && mode === "move") {
        const to = await tx.account.findFirst({ where: { id: String(fd.get("targetId") ?? ""), householdId: m.householdId, ownerMemberId: m.id, currency: acc.currency }, select: { id: true, openingBalance: true } });
        if (!to || to.id === id) throw new Error("Elegí otra cuenta tuya en la misma moneda");
        // Transferencias entre esta cuenta y la de destino: al juntarlas quedan de la cuenta consigo misma (suman 0).
        await tx.transaction.deleteMany({ where: { OR: [{ accountId: id, toAccountId: to.id }, { accountId: to.id, toAccountId: id }] } });
        await tx.transaction.updateMany({ where: { accountId: id }, data: { accountId: to.id } });
        await tx.transaction.updateMany({ where: { toAccountId: id }, data: { toAccountId: to.id } });
        await tx.savingsMovement.updateMany({ where: { accountId: id }, data: { accountId: to.id } });
        await tx.subscription.updateMany({ where: { accountId: id }, data: { accountId: to.id } });
        await tx.installment.updateMany({ where: { paidWithAccountId: id }, data: { paidWithAccountId: to.id } });
        // El saldo inicial también pasa: el total de la cuenta destino queda igual a la suma de las dos.
        await tx.account.update({ where: { id: to.id }, data: { openingBalance: to.openingBalance + acc.openingBalance } });
      } else if (hasAnything && mode === "delete") {
        if (info.deleteBlock) throw new Error(info.deleteBlock);
        await tx.transaction.deleteMany({ where: { OR: [{ accountId: id }, { toAccountId: id }] } });
      } else if (hasAnything) {
        throw new Error("Elegí qué hacer con los movimientos");
      }
      await tx.installment.updateMany({ where: { paidWithAccountId: id }, data: { paidWithAccountId: null } });
      await tx.account.delete({ where: { id } });
      await tx.auditLog.create({ data: { householdId: m.householdId, userId: m.userId, action: mode === "move" ? "DELETE_MOVE" : "DELETE", entity: "Account", entityId: id } });
    });
  } catch (e) { fail(back, e); }
  revalidatePath("/", "layout");
  redirect(`/cuentas?eliminada=${Date.now()}`);
}
