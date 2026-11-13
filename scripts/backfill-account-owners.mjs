// Asigna dueño a las cuentas que no tienen ownerMemberId: el creador del hogar
// (Member con role OWNER; si no hay, el primer miembro por id).
// Uso: node scripts/backfill-account-owners.mjs   (idempotente)
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
try {
  const orphans = await db.account.findMany({
    where: { ownerMemberId: null },
    select: { id: true, name: true, householdId: true },
  });
  console.log(`Cuentas sin dueño: ${orphans.length}`);

  let failed = 0;
  for (const a of orphans) {
    const members = await db.member.findMany({
      where: { householdId: a.householdId },
      select: { id: true, name: true, role: true },
      orderBy: { id: "asc" },
    });
    const owner = members.find((m) => m.role === "OWNER") ?? members[0];
    if (!owner) {
      console.warn(`⚠ La cuenta "${a.name}" (${a.id}) pertenece a un hogar sin miembros; no se asignó dueño.`);
      failed++;
      continue;
    }
    await db.account.update({ where: { id: a.id }, data: { ownerMemberId: owner.id } });
    console.warn(`⚠ La cuenta "${a.name}" (${a.id}) no tenía dueño: se asignó a ${owner.name} (${owner.role}).`);
  }

  if (failed) {
    console.error(`${failed} cuenta(s) quedaron sin dueño. No hagas obligatorio ownerMemberId hasta resolverlo.`);
    process.exitCode = 1;
  }
} finally {
  await db.$disconnect();
}
