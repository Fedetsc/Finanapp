"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLink({ href, cls, children }: { href: string; cls: string; children: React.ReactNode }) {
  const p = usePathname();
  const on = href === "/" ? p === "/" : p.startsWith(href);
  return <Link href={href} className={`${cls} ${on ? "bg-bg font-medium text-primary" : "text-muted"}`}>{children}</Link>;
}
