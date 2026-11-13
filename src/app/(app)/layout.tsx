import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase";
import NavLink from "@/components/NavLink";

// [ruta, etiqueta, etiqueta corta para la barra inferior en celular]
const items = [["/", "Inicio", "Inicio"], ["/movimientos", "Movimientos", "Movim."], ["/cuentas", "Cuentas", "Cuentas"], ["/ahorro", "Ahorro", "Ahorro"], ["/tarjetas", "Tarjetas", "Tarjetas"], ["/suscripciones", "Suscripciones", "Suscrip."], ["/categorias", "Categorías", "Categ."]];

async function out() {
  "use server";
  await supabaseServer().auth.signOut();
  redirect("/login");
}

export default async function Shell({ children }: { children: React.ReactNode }) {
  const m = await requireMember();
  return (
    <div className="min-h-screen md:pl-60">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-surface p-5 md:flex">
        <p className="text-lg font-semibold text-primary">Finanzas</p>
        <p className="mb-6 text-xs text-muted">{m.household.name}</p>
        {items.map(([h, l]) => <NavLink key={h} href={h} cls="rounded-lg px-3 py-2 text-sm">{l}</NavLink>)}
        <form action={out} className="mt-auto"><button className="text-sm text-muted">Cerrar sesión</button></form>
      </aside>
      <header className="flex items-center justify-between p-4 pb-0 md:hidden">
        <p className="font-semibold text-primary">{m.household.name}</p>
        <form action={out}><button className="text-sm text-muted">Salir</button></form>
      </header>
      <main className="mx-auto max-w-5xl p-4 pb-28 md:p-8">{children}</main>
      <Link href="/movimientos#nuevo" aria-label="Registrar movimiento" className="fixed bottom-20 right-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-2xl text-surface shadow-lg md:hidden">+</Link>
      <nav className="fixed inset-x-0 bottom-0 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {items.map(([h, , s]) => <NavLink key={h} href={h} cls="min-w-0 flex-1 truncate px-0.5 py-3 text-center text-[11px]">{s}</NavLink>)}
      </nav>
    </div>
  );
}
