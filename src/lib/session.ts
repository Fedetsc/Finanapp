import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { supabaseServer } from "./supabase";

const memberSelect = Prisma.validator<Prisma.MemberSelect>()({
  id: true,
  householdId: true,
  userId: true,
  role: true,
  household: { select: { name: true, inviteCode: true } },
});

export type SessionMember = Prisma.MemberGetPayload<{ select: typeof memberSelect }>;

/** Usuario autenticado + su hogar. Toda consulta debe filtrar por m.householdId. */
export async function requireMember(): Promise<SessionMember> {
  const sb = supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) redirect("/login");

  const m = await db.member.findUnique({ where: { userId: data.user.id }, select: memberSelect });

  // Usuario autenticado pero sin hogar: tiene que crear uno o unirse.
  if (!m) redirect("/onboarding");
  return m;
}
