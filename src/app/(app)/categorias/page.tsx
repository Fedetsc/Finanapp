import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { fail } from "@/lib/action";
import Err from "@/components/Err";
import SubmitButton from "@/components/SubmitButton";
import { PageHeader } from "@/components/ui";

async function add(fd: FormData) {
  "use server";
  const m = await requireMember();
  try {
    const name = z.string().trim().min(1).max(40).parse(fd.get("name"));
    await db.category.create({ data: { householdId: m.householdId, name } });
  } catch { fail("/categorias", new Error("Revisá el nombre: no puede estar vacío ni repetido")); }
  revalidatePath("/", "layout");
  redirect(`/categorias?ok=${Date.now()}`);
}

async function del(fd: FormData) {
  "use server";
  const m = await requireMember();
  try {
    await db.category.deleteMany({ where: { id: String(fd.get("id")), householdId: m.householdId } });
  } catch { fail("/categorias", new Error("No se puede eliminar una categoría que tiene movimientos")); }
  revalidatePath("/", "layout");
}

export default async function Categorias({ searchParams }: { searchParams: { e?: string; ok?: string } }) {
  const m = await requireMember();
  const cats = await db.category.findMany({ where: { householdId: m.householdId }, orderBy: { name: "asc" } });
  return (
    <div className="space-y-4">
      <PageHeader back={{ href: "/hogar", label: "Hogar" }} title="Categorías" />
      <Err e={searchParams.e} />
      <form key={searchParams.ok} action={add} className="card flex gap-3">
        <input name="name" required maxLength={40} placeholder="Nueva categoría" aria-label="Nueva categoría" className="input" />
        <SubmitButton className="btn shrink-0">Agregar</SubmitButton>
      </form>
      <ul className="card divide-y divide-line py-1">
        {cats.map((c) => (
          <li key={c.id} className="flex items-center justify-between py-2.5 text-sm">
            {c.name}
            <form action={del}><input type="hidden" name="id" value={c.id} /><button className="text-xs text-muted hover:text-neg">Eliminar</button></form>
          </li>
        ))}
      </ul>
    </div>
  );
}
