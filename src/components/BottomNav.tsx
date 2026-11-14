"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./ui";
import { HOGAR_ROUTES, isActive } from "./NavLink";

const LEFT = [{ href: "/", label: "Inicio", icon: "home" }, { href: "/movimientos", label: "Movs.", icon: "list" }];
const RIGHT = [{ href: "/resumen", label: "Resumen", icon: "pie" }, { href: "/hogar", label: "Hogar", icon: "users", also: HOGAR_ROUTES }];

/** Barra inferior móvil: 4 secciones + botón "+" central elevado (nuevo movimiento). */
export default function BottomNav() {
  const path = usePathname();
  const item = (i: { href: string; label: string; icon: string; also?: string[] }) => {
    const on = isActive(path, i.href, i.also) && !(i.href === "/movimientos" && path === "/movimientos/nuevo");
    return (
      <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}
        className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${on ? "text-primary" : "text-muted/80"}`}>
        <Icon name={i.icon} className="h-6 w-6" strokeWidth={on ? 2.4 : 2} />{i.label}
      </Link>
    );
  };
  return (
    <nav aria-label="Navegación principal" className="fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="relative mx-auto flex max-w-md items-end px-2">
        {LEFT.map(item)}
        <div className="flex w-20 shrink-0 justify-center">
          <Link href="/movimientos#nuevo" aria-label="Nuevo movimiento"
            className="-mt-7 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-white shadow-fab ring-4 ring-bg transition active:scale-95">
            <Icon name="plus" className="h-7 w-7" strokeWidth={2.6} />
          </Link>
        </div>
        {RIGHT.map(item)}
      </div>
    </nav>
  );
}
