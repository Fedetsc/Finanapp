// Marco de las pantallas sin sesión / sin hogar (login, register, onboarding). Sin "use client".
import { Icon } from "./ui";

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-mint"><Icon name="home" className="h-5 w-5" /></span>
      <span className="text-xl font-extrabold tracking-tight">Finanapp</span>
    </div>
  );
}

/** Banner azul petróleo con círculos decorativos y un ícono central (sin fotos ni datos de ejemplo). */
export function HeroArt({ icon = "users" }: { icon?: string }) {
  return (
    <div className="relative h-36 overflow-hidden rounded-[24px] bg-primary shadow-soft" aria-hidden="true">
      <span className="absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-white/10" />
      <span className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-primary-2" />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-mint text-primary shadow-fab"><Icon name={icon} className="h-7 w-7" /></span>
      </span>
    </div>
  );
}

export default function AuthShell({ title, subtitle, icon, children, footer }: { title: React.ReactNode; subtitle?: string; icon?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-8">
      <Logo />
      <div className="mt-8"><HeroArt icon={icon} /></div>
      <h1 className="mt-8 text-[30px] font-extrabold leading-[1.1] tracking-tight">{title}</h1>
      {subtitle && <p className="mt-3 text-[15px] leading-relaxed text-muted">{subtitle}</p>}
      <div className="mt-7">{children}</div>
      {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
      <p className="mt-auto flex items-center justify-center gap-1.5 pt-10 text-xs text-muted"><Icon name="lock" className="h-3.5 w-3.5" />Tus datos son privados y solo los ve tu hogar</p>
    </main>
  );
}
