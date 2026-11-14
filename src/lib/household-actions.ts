"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "./db";
import { clearHouseholdCookie, requireUser, setHouseholdCookie } from "./session";
import { supabaseServer } from "./supabase";

/** Cierra la sesión de Supabase y olvida el hogar actual. */
export async function logout() {
  await supabaseServer().auth.signOut();
  clearHouseholdCookie();
  redirect("/login");
}

/** Cambia el hogar actual. Rechaza si el usuario no es miembro de ese hogar. */
export async function switchHousehold(fd: FormData) {
  const user = await requireUser();
  const householdId = String(fd.get("householdId") ?? "");
  const member = await db.member.findUnique({ where: { userId_householdId: { userId: user.id, householdId } }, select: { id: true } });
  if (!member) redirect(`/?e=${encodeURIComponent("No sos miembro de ese hogar")}`);
  setHouseholdCookie(householdId);
  revalidatePath("/", "layout");
  redirect("/");
}
