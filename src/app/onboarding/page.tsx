import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail } from "@/lib/action";
import { listMemberships, requireUser, roleLabel, setHouseholdCookie } from "@/lib/session";
import Err from "@/components/Err";

const CATEGORIES = ["Vivienda", "Alimentación", "Supermercado", "Servicios", "Transporte", "Combustible", "Salud", "Entretenimiento", "Compras", "Educación", "Mascotas", "Finanzas", "Impuestos", "Ahorros", "Sueldo", "Otros"];
const Me = z.string().trim().min(1, "Poné tu nombre").max(40);

async function create(fd: FormData) {
  "use server";
  const u = await requireUser();
  let householdId = "";
  try {
    const r = z.object({ name: z.string().trim().min(1, "Poné el nombre del hogar").max(60), me: Me }).parse(Object.fromEntries(fd));
    householdId = await db.$transaction(async (tx) => {
      // inviteCode lo genera la base (uuid único).
      const h = await tx.household.create({ data: { name: r.name } });
      await tx.member.create({ data: { userId: u.id, householdId: h.id, name: r.me, role: "ADMIN" } });
      await tx.category.createMany({ data: CATEGORIES.map((name) => ({ householdId: h.id, name })) });
      return h.id;
    });
  } catch (e) { fail("/onboarding", e instanceof z.ZodError ? new Error(e.issues[0]?.message) : e); }
  setHouseholdCookie(householdId);
  revalidatePath("/", "layout");
  redirect("/");
}

async function join(fd: FormData) {
  "use server";
  const u = await requireUser();
  let householdId = "";
  try {
    const r = z.object({ code: z.string().trim().min(1, "Poné el código de invitación"), me: Me }).parse(Object.fromEntries(fd));
    const h = await db.household.findUnique({ where: { inviteCode: r.code }, select: { id: true } });
    if (!h) throw new Error("Código inválido");
    householdId = h.id;
    // Si ya es miembro de ese hogar no se crea otra membresía: solo pasa a ser el hogar actual.
    const already = await db.member.findUnique({ where: { userId_householdId: { userId: u.id, householdId: h.id } }, select: { id: true } });
    if (!already) await db.member.create({ data: { userId: u.id, householdId: h.id, name: r.me, role: "MEMBER" } });
  } catch (e) { fail("/onboarding", e instanceof z.ZodError ? new Error(e.issues[0]?.message) : e); }
  setHouseholdCookie(householdId);
  revalidatePath("/", "layout");
  redirect("/");
}

export default async function Onboarding({ searchParams }: { searchParams: { e?: string } }) {
  const u = await requireUser();
  // Se puede entrar teniendo hogares: sirve para crear otro o unirse a otro.
  const memberships = await listMemberships(u.id);
  const lastName = memberships.length ? (await db.member.findFirst({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, select: { name: true } }))?.name : undefined;
  const suggested = lastName ?? u.email?.split("@")[0] ?? "";

  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-primary">Tu hogar</h1>
        <p className="mt-1 text-sm text-muted">{memberships.length ? "Creá otro hogar o unite a uno con un código." : "Para empezar, creá un hogar o unite al de tu pareja con su código."}</p>
      </div>
      <Err e={searchParams.e} />

      {memberships.length > 0 && (
        <div className="card text-sm">
          <p className="text-xs text-muted">Ya sos parte de:</p>
          <ul className="mt-1 space-y-0.5">{memberships.map((x) => <li key={x.householdId}>{x.household.name} <span className="text-xs text-muted">· {roleLabel(x.role)}</span></li>)}</ul>
          <Link href="/" className="mt-2 inline-block text-primary underline">Volver a la app</Link>
        </div>
      )}

      <form action={create} className="card space-y-3">
        <h2 className="font-medium">Crear un hogar nuevo</h2>
        <input name="name" required maxLength={60} placeholder="Nombre del hogar" className="input" />
        <input name="me" required maxLength={40} defaultValue={suggested} placeholder="Tu nombre en este hogar" aria-label="Tu nombre en este hogar" className="input" />
        <button className="btn w-full">Crear</button>
      </form>

      <form action={join} className="card space-y-3">
        <h2 className="font-medium">Unirme a un hogar existente</h2>
        <input name="code" required placeholder="Código de invitación" autoComplete="off" className="input font-mono" />
        <input name="me" required maxLength={40} defaultValue={suggested} placeholder="Tu nombre en este hogar" aria-label="Tu nombre en este hogar" className="input" />
        <button className="btn w-full">Unirse</button>
      </form>
    </main>
  );
}
