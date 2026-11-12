import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { supabaseServer } from "@/lib/supabase";
import { fail } from "@/lib/action";
import Err from "@/components/Err";

const CATEGORIES = ["Vivienda", "Alimentación", "Supermercado", "Servicios", "Transporte", "Combustible", "Salud", "Entretenimiento", "Compras", "Educación", "Mascotas", "Finanzas", "Impuestos", "Ahorros", "Sueldo", "Otros"];

async function user() {
  const { data } = await supabaseServer().auth.getUser();
  if (!data.user) redirect("/login");
  return data.user;
}

async function create(fd: FormData) {
  "use server";
  const u = await user();
  try {
    const r = z.object({ name: z.string().trim().min(1).max(60), me: z.string().trim().min(1).max(40) }).parse(Object.fromEntries(fd));
    await db.$transaction(async (tx) => {
      const h = await tx.household.create({ data: { name: r.name } });
      await tx.member.create({ data: { userId: u.id, householdId: h.id, name: r.me, role: "OWNER" } });
      await tx.category.createMany({ data: CATEGORIES.map((name) => ({ householdId: h.id, name })) });
    });
  } catch (e) { fail("/onboarding", e); }
  redirect("/");
}

async function join(fd: FormData) {
  "use server";
  const u = await user();
  try {
    const r = z.object({ code: z.string().trim().min(1), me: z.string().trim().min(1).max(40) }).parse(Object.fromEntries(fd));
    const h = await db.household.findUnique({ where: { inviteCode: r.code }, include: { _count: { select: { members: true } } } });
    if (!h || h._count.members >= 2) throw new Error("El código no es válido o el hogar ya está completo");
    await db.member.create({ data: { userId: u.id, householdId: h.id, name: r.me } });
  } catch (e) { fail("/onboarding", e); }
  redirect("/");
}

export default async function Onboarding({ searchParams }: { searchParams: { e?: string } }) {
  const u = await user();
  if (await db.member.findUnique({ where: { userId: u.id } })) redirect("/");
  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-2xl font-semibold text-primary">Tu hogar</h1>
      <Err e={searchParams.e} />
      <form action={create} className="card space-y-3">
        <h2 className="font-medium">Crear un hogar nuevo</h2>
        <input name="name" required placeholder="Nombre del hogar" className="input" />
        <input name="me" required placeholder="Tu nombre" className="input" />
        <button className="btn w-full">Crear hogar</button>
      </form>
      <form action={join} className="card space-y-3">
        <h2 className="font-medium">Unirme con un código de invitación</h2>
        <input name="code" required placeholder="Código de invitación" className="input" />
        <input name="me" required placeholder="Tu nombre" className="input" />
        <button className="btn w-full">Unirme</button>
      </form>
    </main>
  );
}
