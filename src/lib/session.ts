import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { supabaseServer } from "./supabase";

/** Usuario autenticado + su hogar. Toda consulta debe filtrar por m.householdId. */
export async function requireMember(): Promise<
  Prisma.MemberGetPayload<{
    select: {
      id: true;
      householdId: true;
      role: true;
      household: { select: { name: true } };
    };
  }>
> {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) redirect("/login");

  const m = await db.member.findUnique({
    where: { userId: data.user.id },
    select: {
      id: true,
      householdId: true,
      role: true,
      household: {
        select: { name: true },
      },
    }
  });

  if (!m) redirect("/login");
  return m;
}