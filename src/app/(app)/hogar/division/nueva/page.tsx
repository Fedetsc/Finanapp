import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { createGroup } from "@/lib/split-actions";
import { PageHeader } from "@/components/ui";
import Err from "@/components/Err";
import SplitGroupForm from "@/components/SplitGroupForm";

/** Crear una división: arranca con los miembros del hogar; se pueden sacar y sumar nombres libres. */
export default async function NuevaDivision({ searchParams: sp }: { searchParams: { e?: string } }) {
  const m = await requireMember();
  const [members, currencies] = await Promise.all([
    db.member.findMany({ where: { householdId: m.householdId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
    db.account.findMany({ where: { householdId: m.householdId }, distinct: ["currency"], select: { currency: true } }),
  ]);
  const curs = ["ARS", ...currencies.map((c) => c.currency).filter((c) => c !== "ARS").sort()];
  // Nombres repetidos entre miembros (dos "Fede"): se distinguen con un número.
  const seen = new Map<string, number>();
  const people = members.map((x) => { const n = (seen.get(x.name) ?? 0) + 1; seen.set(x.name, n); return { name: n > 1 ? `${x.name} ${n}` : x.name, memberId: x.id }; });
  return (
    <div>
      <PageHeader title="Nueva división" back={{ href: "/hogar/division", label: "Divisiones" }} />
      <Err e={sp.e} />
      <SplitGroupForm members={people} currencies={curs} action={createGroup} />
    </div>
  );
}
