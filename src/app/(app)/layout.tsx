import Link from "next/link";
import { listMemberships, requireMember, roleLabel } from "@/lib/session";
import { logout } from "@/lib/household-actions";
import NavLink from "@/components/NavLink";
import BottomNav from "@/components/BottomNav";
import HouseholdSwitcher from "@/components/HouseholdSwitcher";
import { Avatar, Icon } from "@/components/ui";

const MAIN = [["/", "Inicio", "home"], ["/movimientos", "Movimientos", "list"], ["/resumen", "Resumen", "pie"]];
const HOGAR = [["/hogar", "Hogar", "users"], ["/cuentas", "Cuentas", "bank"], ["/ahorro", "Ahorro", "piggy"], ["/tarjetas", "Tarjetas", "card"], ["/suscripciones", "Suscripciones", "repeat"], ["/categorias", "Categorías", "tag"]];

export default async function Shell({ children }: { children: React.ReactNode }) {
  const m = await requireMember();
  const all = await listMemberships(m.userId);
  return (
    <div className="min-h-screen md:pl-72">
      {/* Desktop: barra lateral blanca con todas las secciones y el usuario al pie. */}
      <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col gap-1 overflow-y-auto bg-surface px-5 py-6 shadow-soft md:flex">
        <Link href="/" className="mb-6 flex items-center gap-2.5 px-1">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-mint"><Icon name="home" className="h-5 w-5" /></span>
          <span className="text-lg font-extrabold tracking-tight">Finanapp</span>
        </Link>
        {MAIN.map(([h, l, i]) => <NavLink key={h} href={h} icon={i}>{l}</NavLink>)}
        <p className="mb-1 mt-5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Hogar</p>
        {HOGAR.map(([h, l, i]) => <NavLink key={h} href={h} icon={i}>{l}</NavLink>)}
        <Link href="/movimientos#nuevo" className="btn mt-5"><Icon name="plus" className="h-4 w-4" />Nuevo movimiento</Link>

        <div className="mt-auto space-y-2 pt-6">
          <details className="group rounded-2xl bg-bg">
            <summary className="flex cursor-pointer list-none items-center gap-3 p-3 [&::-webkit-details-marker]:hidden">
              <Avatar name={m.name || m.email} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{m.name || m.email}</span>
                {m.name && <span className="block truncate text-xs text-muted">{m.email}</span>}
                <span className="block truncate text-xs text-muted">{m.household.name} · {roleLabel(m.role)}</span>
              </span>
              <Icon name="chevronDown" className="h-4 w-4 text-muted transition group-open:rotate-180" />
            </summary>
            <div className="border-t border-line p-2"><HouseholdSwitcher currentId={m.householdId} all={all} compact /></div>
          </details>
          <form action={logout}>
            <button className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold text-muted hover:bg-bg hover:text-neg">
              <Icon name="logout" className="h-4 w-4" />Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      <main className="mx-auto max-w-2xl px-4 pb-32 pt-6 md:px-8 md:pb-12 md:pt-10">{children}</main>
      <BottomNav />
    </div>
  );
}
