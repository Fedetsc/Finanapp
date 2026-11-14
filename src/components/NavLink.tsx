"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./ui";

/** Rutas que cuentan como "Hogar" en la barra inferior (sus subsecciones). */
export const HOGAR_ROUTES = ["/hogar", "/cuentas", "/ahorro", "/tarjetas", "/suscripciones", "/categorias"];

export function isActive(path: string, href: string, also: string[] = []) {
  const hit = (h: string) => (h === "/" ? path === "/" : path === h || path.startsWith(h + "/"));
  return hit(href) || also.some(hit);
}

/** Item de la barra lateral (desktop). */
export default function NavLink({ href, icon, children }: { href: string; icon: string; children: React.ReactNode }) {
  const on = isActive(usePathname(), href);
  return (
    <Link href={href} aria-current={on ? "page" : undefined}
      className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${on ? "bg-primary text-white shadow-soft" : "text-muted hover:bg-bg hover:text-text"}`}>
      <Icon name={icon} className="h-5 w-5" />{children}
    </Link>
  );
}
