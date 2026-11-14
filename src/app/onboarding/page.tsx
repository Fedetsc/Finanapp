import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail } from "@/lib/action";
import { listMemberships, requireUser, roleLabel, setHouseholdCookie } from "@/lib/session";
import Err from "@/components/Err";
import AuthShell from "@/components/AuthShell";
import SubmitButton from "@/components/SubmitButton";
import { Icon, IconTile } from "@/components/ui";

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

  // Opción desplegable estilo ejemplo: ícono, título, subtítulo y flecha; adentro el formulario.
  const Option = ({ icon, tone, title, hint, open, children }: { icon: string; tone: "navy" | "green"; title: string; hint: string; open?: boolean; children: React.ReactNode }) => (
    <details name="opcion" open={open} className="group rounded-[20px] border-2 border-transparent bg-surface shadow-soft open:border-primary">
      <summary className="flex cursor-pointer list-none items-center gap-4 p-4 [&::-webkit-details-marker]:hidden">
        <IconTile icon={icon} tone={tone} size="lg" />
        <span className="min-w-0 flex-1"><span className="block font-bold">{title}</span><span className="block text-sm text-muted">{hint}</span></span>
        <Icon name="chevronRight" className="h-5 w-5 text-muted transition group-open:rotate-90 group-open:text-primary" />
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );

  return (
    <AuthShell
      icon="users"
      title={<>Las cuentas de casa,<br />más simples juntos</>}
      subtitle={memberships.length ? "Creá otro hogar o unite a uno con un código." : "Registrá gastos en segundos y mantené a tu pareja o familia en la misma página."}
    >
      <Err e={searchParams.e} />

      {memberships.length > 0 && (
        <div className="card mb-4">
          <p className="text-xs font-medium text-muted">Ya sos parte de</p>
          <ul className="mt-2 space-y-1.5">{memberships.map((x) => <li key={x.householdId} className="flex items-center gap-2 text-sm"><IconTile icon="home" tone="gray" size="sm" /><span className="flex-1 truncate font-semibold">{x.household.name}</span><span className="text-xs text-muted">{roleLabel(x.role)}</span></li>)}</ul>
          <Link href="/" className="btn-ghost mt-3 w-full">Volver a la app</Link>
        </div>
      )}

      <div className="space-y-3">
        <Option icon="home" tone="navy" title="Crear un nuevo hogar" hint="Invitá a tu pareja o familia después" open={memberships.length === 0}>
          <form action={create} className="space-y-3">
            <input name="name" required maxLength={60} placeholder="Nombre del hogar" aria-label="Nombre del hogar" className="input bg-bg" />
            <input name="me" required maxLength={40} defaultValue={suggested} placeholder="Tu nombre en este hogar" aria-label="Tu nombre en este hogar" className="input bg-bg" />
            <SubmitButton className="btn w-full py-4 text-base" pendingText="Creando...">Crear</SubmitButton>
          </form>
        </Option>
        <Option icon="key" tone="green" title="Unirme con un código" hint="Ya tienen un hogar creado">
          <form action={join} className="space-y-3">
            <input name="code" required placeholder="Código de invitación" aria-label="Código de invitación" autoComplete="off" className="input bg-bg text-center font-mono" />
            <input name="me" required maxLength={40} defaultValue={suggested} placeholder="Tu nombre en este hogar" aria-label="Tu nombre en este hogar" className="input bg-bg" />
            <SubmitButton className="btn w-full bg-mint py-4 text-base text-primary hover:bg-mint/90" pendingText="Uniéndote...">Unirse</SubmitButton>
          </form>
        </Option>
      </div>
    </AuthShell>
  );
}
