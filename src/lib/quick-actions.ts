"use server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { requireMember } from "./session";
import { parseDate, toCents, todayAR } from "./util";

export type QuickResult = { ok: true; type: "INCOME" | "EXPENSE"; id: string } | { ok: false; error: string };

const Form = z.object({
  type: z.enum(["INCOME", "EXPENSE"]),
  amount: z.string(),
  accountId: z.string().min(1),
  categoryId: z.string().optional().default(""),
  description: z.string().trim().max(120).optional().default(""),
});
/** Categoría por defecto si no se elige ninguna (se crea en el hogar la primera vez que hace falta). */
const FALLBACK = { EXPENSE: "Gastos Varios", INCOME: "Ingresos Varios" } as const;

/**
 * Alta rápida de ingreso/gasto desde Inicio (bottom sheet). Mismas reglas que /movimientos/nuevo:
 * cuenta propia, importe > 0. Fecha = hoy (Argentina), miembro = el logueado. No redirige: devuelve el resultado.
 */
export async function quickAdd(fd: FormData): Promise<QuickResult> {
  const m = await requireMember();
  try {
    const f = Form.parse(Object.fromEntries(fd));
    const amount = toCents(f.amount);
    if (amount <= 0n) throw new Error("El importe debe ser mayor a cero");
    const date = parseDate(todayAR());

    const acc = await db.account.findUnique({ where: { id: f.accountId } });
    if (!acc || acc.householdId !== m.householdId) throw new Error("Elegí una cuenta válida");
    if (acc.ownerMemberId !== m.id) throw new Error("No podés usar la cuenta de otro miembro");

    const cat = f.categoryId
      ? await db.category.findFirst({ where: { id: f.categoryId, householdId: m.householdId } })
      : await db.category.upsert({ where: { householdId_name: { householdId: m.householdId, name: FALLBACK[f.type] } }, update: {}, create: { householdId: m.householdId, name: FALLBACK[f.type] } });
    if (!cat) throw new Error("Elegí una categoría");

    const t = await db.$transaction(async (tx) => {
      const t = await tx.transaction.create({ data: { householdId: m.householdId, memberId: m.id, accountId: acc.id, type: f.type, amount, date, description: f.description, categoryId: cat.id } });
      await tx.auditLog.create({ data: { householdId: m.householdId, userId: m.userId, action: "CREATE", entity: "Transaction", entityId: t.id } });
      return t;
    });
    revalidatePath("/", "layout"); // Inicio (y el resto) se actualiza en la misma respuesta
    return { ok: true, type: f.type, id: t.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError || e instanceof Prisma.PrismaClientUnknownRequestError || e instanceof Prisma.PrismaClientValidationError) {
      console.error("[quickAdd]", e.message);
      return { ok: false, error: "No se pudo guardar. Probá de nuevo en un momento." };
    }
    return { ok: false, error: e instanceof Error && !(e instanceof z.ZodError) ? e.message : "Revisá los datos ingresados" };
  }
}
