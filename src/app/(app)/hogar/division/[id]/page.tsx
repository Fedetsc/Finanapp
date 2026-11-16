import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import SplitGroupView, { GROUP_SELECT } from "@/components/SplitGroupView";

/** Detalle de una división: personas, gastos y la calculadora "Quién le debe a quién". */
export default async function Division({ params, searchParams: sp }: { params: { id: string }; searchParams: { e?: string; ok?: string; editar?: string } }) {
  const m = await requireMember();
  const g = await db.splitGroup.findFirst({ where: { id: params.id, householdId: m.householdId }, select: GROUP_SELECT });
  if (!g) notFound();
  // Cuentas mías en la moneda de la división: solo para el botón opcional "Pasar a movimientos".
  const myAccounts = await db.account.findMany({ where: { householdId: m.householdId, ownerMemberId: m.id, currency: g.currency }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  return <SplitGroupView g={g} memberId={m.id} myAccounts={myAccounts} sp={sp} />;
}
