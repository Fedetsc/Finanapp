import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { supabaseServer } from "./supabase";

/** Cookie con el hogar elegido. Solo es una preferencia: siempre se valida que el usuario sea miembro. */
export const HOUSEHOLD_COOKIE = "current_household_id";

const memberSelect = Prisma.validator<Prisma.MemberSelect>()({
  id: true,
  householdId: true,
  userId: true,
  name: true,
  role: true,
  household: { select: { name: true, inviteCode: true } },
});

export type SessionMember = Prisma.MemberGetPayload<{ select: typeof memberSelect }> & { email: string };

export const isAdmin = (role: string) => role === "ADMIN" || role === "OWNER";
export const roleLabel = (role: string) => (isAdmin(role) ? "Admin" : "Miembro");

/** Guarda el hogar actual. Solo funciona en Server Actions / Route Handlers (no al renderizar). */
export function setHouseholdCookie(householdId: string) {
  cookies().set(HOUSEHOLD_COOKIE, householdId, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export function clearHouseholdCookie() {
  cookies().delete(HOUSEHOLD_COOKIE);
}

/** Usuario de Supabase o redirect a /login. */
export async function requireUser() {
  const { data } = await supabaseServer().auth.getUser();
  if (!data.user) redirect("/login");
  return data.user;
}

/**
 * Usuario autenticado + su membresía en el hogar ACTUAL. Toda consulta debe filtrar por m.householdId.
 * 1. Si la cookie current_household_id apunta a un hogar donde el usuario es miembro, usa ese.
 * 2. Si no (no hay cookie, es de otro usuario o lo sacaron del hogar), usa su membresía más antigua
 *    y la guarda en la cookie cuando se puede (en Server Actions; al renderizar Next no deja escribir cookies).
 * 3. Si no tiene ningún hogar, va a /onboarding.
 */
export async function requireMember(): Promise<SessionMember> {
  const user = await requireUser();
  const wanted = cookies().get(HOUSEHOLD_COOKIE)?.value;

  let m = wanted
    ? await db.member.findUnique({ where: { userId_householdId: { userId: user.id, householdId: wanted } }, select: memberSelect })
    : null;
  if (!m) {
    m = await db.member.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, select: memberSelect });
    if (!m) redirect("/onboarding");
    try { setHouseholdCookie(m.householdId); } catch { /* render de Server Component: se reintenta en la próxima acción */ }
  }
  return { ...m, email: user.email ?? "" };
}

/** Todos los hogares del usuario, para el selector. */
export function listMemberships(userId: string) {
  return db.member.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { householdId: true, role: true, household: { select: { name: true } } },
  });
}
