// Componentes de UI compartidos. SIN "use client": sirven en Server y Client Components
// (no usan hooks ni APIs del navegador).
import Link from "next/link";
import type { Tone } from "@/lib/visuals";

/* ---------- Íconos (trazos 24x24, estilo lineal) ---------- */
const P: Record<string, React.ReactNode> = {
  cart: <><path d="M3 4h2l2.3 10.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.1" /><circle cx="9" cy="19" r="1.4" /><circle cx="17" cy="19" r="1.4" /></>,
  home: <path d="M3 11 12 4l9 7v8.5a.5.5 0 0 1-.5.5H15v-6H9v6H3.5a.5.5 0 0 1-.5-.5z" />,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  car: <><path d="M3 13.5 5 8a2 2 0 0 1 1.9-1.4h10.2A2 2 0 0 1 19 8l2 5.5V18H3z" /><path d="M7 15.5h.01M17 15.5h.01M5 18v2M19 18v2" /></>,
  pill: <><rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)" /><path d="m8.5 8.5 7 7" /></>,
  film: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4" /></>,
  bag: <><path d="M5.5 8h13l-1 12h-11z" /><path d="M9 8a3 3 0 0 1 6 0" /></>,
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" /></>,
  paw: <><circle cx="6" cy="10" r="1.7" /><circle cx="9.5" cy="6" r="1.7" /><circle cx="14.5" cy="6" r="1.7" /><circle cx="18" cy="10" r="1.7" /><path d="M12 13c-3 0-5.5 2.8-5.5 5 0 1.6 1.3 2.5 3 2.5 1 0 1.6-.5 2.5-.5s1.5.5 2.5.5c1.7 0 3-.9 3-2.5 0-2.2-2.5-5-5.5-5z" /></>,
  card: <><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h3" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  piggy: <><path d="M4.5 12a6.5 5.5 0 0 1 12.2-2.7H19l-.5 2.4 1.5.8v3l-2 .5-1 2.5H15l-.5-1.3h-4L10 19H8l-.8-2.6A5.4 5.4 0 0 1 4.5 12z" /><path d="M15 11h.01M9.5 7.5a3 3 0 0 1 3.5-1" /></>,
  wallet: <><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" /><path d="M4 7.5v10A2.5 2.5 0 0 0 6.5 20H20V8H6.5A2.5 2.5 0 0 1 4 7.5z" /><path d="M16 14h.01" /></>,
  repeat: <><path d="m17 2 4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="m7 22-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></>,
  transfer: <><path d="M7 7h13l-4-4M17 17H4l4 4" /></>,
  tag: <><path d="M3 12V4h8l10 10-8 8z" /><path d="M7.5 7.5h.01" /></>,
  bank: <><path d="M3 10h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20.5h18M12 3l9 4.5v.5H3v-.5z" /></>,
  cash: <><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 9.5v.01M18 14.5v.01" /></>,
  trend: <><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  down: <path d="M12 5v14m-6-6 6 6 6-6" />,
  up: <path d="M12 19V5m-6 6 6-6 6 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  chevronLeft: <path d="m15 6-6 6 6 6" />,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6" /></>,
  pie: <><path d="M12 3v9h9a9 9 0 1 1-9-9z" /><path d="M15 3.5A9 9 0 0 1 20.5 9H15z" /></>,
  list: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>,
  logout: <><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" /><path d="M10 17l-5-5 5-5M5 12h11" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M17 6l3 3M14.5 8.5l2 2" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  note: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 6.5 8.5 6 8.5-6" /></>,
};

export function Icon({ name, className = "h-5 w-5", strokeWidth = 2 }: { name: string; className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {P[name] ?? P.tag}
    </svg>
  );
}

/* Fondos pastel de los íconos, como en el ejemplo. Hex fijos: son colores de marca, no de tema. */
export const TONES: Record<Tone, string> = {
  orange: "bg-[#FFF1E5] text-[#F97316]",
  green: "bg-[#E6F5EE] text-[#2E8B62]",
  blue: "bg-[#EAF3FB] text-[#1E88E5]",
  violet: "bg-[#F1EEFC] text-[#7C5CE0]",
  pink: "bg-[#FDECEE] text-[#E5484D]",
  navy: "bg-primary text-white",
  gray: "bg-bg text-muted",
};

export function IconTile({ icon, tone = "gray", size = "md" }: { icon: string; tone?: Tone; size?: "sm" | "md" | "lg" }) {
  const s = size === "lg" ? "h-14 w-14 rounded-2xl" : size === "sm" ? "h-9 w-9 rounded-xl" : "h-11 w-11 rounded-[14px]";
  return <span className={`flex shrink-0 items-center justify-center ${s} ${TONES[tone]}`}><Icon name={icon} className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} /></span>;
}

/* ---------- Avatar con inicial ---------- */
const AV = ["bg-[#E6F5EE] text-[#2E8B62]", "bg-[#EAF3FB] text-[#1E6FB8]", "bg-[#F1EEFC] text-[#6A4FD0]", "bg-[#FFF1E5] text-[#C2570C]", "bg-[#FDECEE] text-[#C23A3F]"];
const hash = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

export function Avatar({ name, size = "md", ring = false }: { name: string; size?: "sm" | "md" | "lg"; ring?: boolean }) {
  const s = size === "lg" ? "h-12 w-12 text-base" : size === "sm" ? "h-7 w-7 text-[11px]" : "h-10 w-10 text-sm";
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full font-bold uppercase ${s} ${AV[hash(name) % AV.length]} ${ring ? "ring-2 ring-surface" : ""}`}>
      {(name.trim() || "?").charAt(0)}
    </span>
  );
}

export function AvatarStack({ names, size = "md" }: { names: string[]; size?: "sm" | "md" | "lg" }) {
  return <span className="flex -space-x-2">{names.map((n, i) => <Avatar key={i} name={n} size={size} ring />)}</span>;
}

/* ---------- Estructura ---------- */
export function Card({ className = "", children, as: As = "div" }: { className?: string; children: React.ReactNode; as?: "div" | "section" | "li" | "article" }) {
  return <As className={`card ${className}`}>{children}</As>;
}

/** Card principal azul petróleo con el círculo decorativo. */
export function HeroCard({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`relative overflow-hidden rounded-[24px] bg-primary p-6 text-white shadow-soft ${className}`}>
      <span aria-hidden="true" className="pointer-events-none absolute -right-14 -top-14 h-48 w-48 rounded-full bg-primary-2/80" />
      <div className="relative">{children}</div>
    </div>
  );
}

export function PageHeader({ title, subtitle, back, right }: { title: React.ReactNode; subtitle?: React.ReactNode; back?: { href: string; label: string }; right?: React.ReactNode }) {
  return (
    <header className="mb-5 flex items-end justify-between gap-3">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-1 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-text">
            <Icon name="chevronLeft" className="h-4 w-4" />{back.label}
          </Link>
        )}
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        <h1 className="truncate text-[28px] font-extrabold leading-tight tracking-tight">{title}</h1>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return <div className="mb-3 mt-7 flex items-center justify-between gap-3"><h2 className="section-title">{title}</h2>{action}</div>;
}

export function Button({ variant = "primary", className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  return <button {...props} className={`${variant === "ghost" ? "btn-ghost" : "btn"} ${className}`} />;
}

export function Input({ label, className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  const el = <input {...props} className={`input ${className}`} />;
  return label ? <label className="block"><span className="label">{label}</span>{el}</label> : el;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "ok" | "warn"; children: React.ReactNode }) {
  const cls = tone === "ok" ? "bg-mint-soft text-pos" : tone === "warn" ? "bg-[#FFF4E0] text-[#9A5B00]" : "bg-surface text-text shadow-soft";
  return <p role="status" className={`mb-4 rounded-2xl px-4 py-3 text-sm ${cls}`}>{children}</p>;
}

export function Empty({ icon = "list", children }: { icon?: string; children: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 py-10 text-center text-sm text-muted">
      <IconTile icon={icon} tone="gray" size="lg" />
      <div>{children}</div>
    </div>
  );
}
