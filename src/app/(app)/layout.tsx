import Link from "next/link";
import { redirect } from "next/navigation";
import { clearHouseholdCookie, listMemberships, requireMember, roleLabel, type SessionMember } from "@/lib/session";
import { switchHousehold } from "@/lib/household-actions";
import { supabaseServer } from "@/lib/supabase";
import NavLink from "@/components/NavLink";

// [ruta, etiqueta, etiqueta corta para la barra inferior en celular]
const items = [["/", "Inicio", "Inicio"], ["/movimientos", "Movimientos", "Movim."], ["/cuentas", "Cuentas", "Cuentas"], ["/ahorro", "Ahorro", "Ahorro"], ["/tarjetas", "Tarjetas", "Tarjetas"], ["/suscripciones", "Suscripciones", "Suscrip."], ["/categorias", "Categorías", "Categ."]];

async function out() {
  "use server";
  await supabaseServer().auth.signOut();
  clearHouseholdCookie();
  redirect("/login");
}

type Memberships = Awaited<ReturnType<typeof listMemberships>>;

const Avatar = ({ m, size = "h-9 w-9" }: { m: SessionMember; size?: string }) => (
  <span aria-hidden="true" className={`${size} flex shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold uppercase text-surface`}>
    {(m.name || m.email || "?").trim().charAt(0)}
  </span>
);

/** Lista de hogares del usuario con el actual marcado; elegir otro llama a switchHousehold. */
function HouseholdSwitcher({ m, all }: { m: SessionMember; all: Memberships }) {
  return (
    <div className="space-y-1">
      <p className="px-1 text-[11px] uppercase tracking-wide text-muted">Tus hogares</p>
      <ul className="space-y-0.5">
        {all.map((h) => {
          const current = h.householdId === m.householdId;
          return (
            <li key={h.householdId}>
              <form action={switchHousehold}>
                <input type="hidden" name="householdId" value={h.householdId} />
                <button disabled={current} aria-current={current ? "true" : undefined}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${current ? "bg-bg font-medium" : "hover:bg-bg"}`}>
                  <span className="w-4 text-primary" aria-hidden="true">{current ? "✓" : ""}</span>
                  <span className="min-w-0 flex-1 truncate">{h.household.name}</span>
                  <span className="shrink-0 text-xs text-muted">{roleLabel(h.role)}</span>
                </button>
              </form>
            </li>
          );
        })}
      </ul>
      <Link href="/onboarding" className="block rounded-lg px-2 py-1.5 text-sm text-primary hover:bg-bg">+ Crear o unirme a otro hogar</Link>
    </div>
  );
}

function UserBox({ m, all }: { m: SessionMember; all: Memberships }) {
  return (
    <details className="group rounded-xl border border-line bg-bg/50">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-2.5 [&::-webkit-details-marker]:hidden">
        <Avatar m={m} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{m.name || m.email}</span>
          {m.name && <span className="block truncate text-xs text-muted">{m.email}</span>}
          <span className="block truncate text-xs text-muted">{m.household.name} · {roleLabel(m.role)}</span>
        </span>
        <span className="text-xs text-muted transition group-open:rotate-180" aria-hidden="true">▾</span>
      </summary>
      <div className="border-t border-line p-2">
        <HouseholdSwitcher m={m} all={all} />
      </div>
    </details>
  );
}

export default async function Shell({ children }: { children: React.ReactNode }) {
  const m = await requireMember();
  const all = await listMemberships(m.userId);
  return (
    <div className="min-h-screen md:pl-60">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-surface p-5 md:flex">
        <p className="text-lg font-semibold text-primary">Finanzas</p>
        <p className="mb-6 truncate text-xs text-muted">{m.household.name}</p>
        {items.map(([h, l]) => <NavLink key={h} href={h} cls="rounded-lg px-3 py-2 text-sm">{l}</NavLink>)}
        <div className="mt-auto space-y-3">
          <UserBox m={m} all={all} />
          <form action={out}><button className="text-sm text-muted hover:text-text">Cerrar sesión</button></form>
        </div>
      </aside>
      <header className="flex items-center justify-between gap-3 p-4 pb-0 md:hidden">
        <details className="relative min-w-0">
          <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
            <Avatar m={m} size="h-8 w-8" />
            <span className="min-w-0">
              <span className="block truncate font-semibold text-primary">{m.household.name}</span>
              <span className="block truncate text-[11px] text-muted">{m.name || m.email} · {roleLabel(m.role)}</span>
            </span>
            <span className="text-xs text-muted" aria-hidden="true">▾</span>
          </summary>
          <div className="absolute left-0 z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface p-2 shadow-lg">
            <p className="truncate px-1 pb-2 text-xs text-muted">{m.email}</p>
            <HouseholdSwitcher m={m} all={all} />
          </div>
        </details>
        <form action={out}><button className="shrink-0 text-sm text-muted">Salir</button></form>
      </header>
      <main className="mx-auto max-w-5xl p-4 pb-28 md:p-8">{children}</main>
      <Link href="/movimientos#nuevo" aria-label="Registrar movimiento" className="fixed bottom-20 right-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-2xl text-surface shadow-lg md:hidden">+</Link>
      <nav className="fixed inset-x-0 bottom-0 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {items.map(([h, , s]) => <NavLink key={h} href={h} cls="min-w-0 flex-1 truncate px-0.5 py-3 text-center text-[11px]">{s}</NavLink>)}
      </nav>
    </div>
  );
}
