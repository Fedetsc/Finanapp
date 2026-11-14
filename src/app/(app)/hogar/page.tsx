import Link from "next/link";
import { db } from "@/lib/db";
import { listMemberships, requireMember, roleLabel, isAdmin } from "@/lib/session";
import { logout } from "@/lib/household-actions";
import { accountBalances } from "@/lib/balances";
import { money } from "@/lib/currency";
import { ACCOUNT_VISUAL } from "@/lib/visuals";
import HouseholdSwitcher from "@/components/HouseholdSwitcher";
import CopyButton from "@/components/CopyButton";
import { Avatar, AvatarStack, HeroCard, Icon, IconTile, PageHeader, SectionHeader } from "@/components/ui";

const LINKS = [
  ["/cuentas", "Cuentas", "bank", "blue", "Saldos de cada cuenta"],
  ["/ahorro", "Ahorro", "piggy", "green", "Plata apartada"],
  ["/tarjetas", "Tarjetas", "card", "violet", "Compras en cuotas"],
  ["/suscripciones", "Suscripciones", "repeat", "orange", "Cobros automáticos"],
  ["/categorias", "Categorías", "tag", "pink", "Para clasificar gastos"],
] as const;

/** Hub del hogar (como el ejemplo): miembros, código de invitación, cuentas, secciones y cambio de hogar. */
export default async function Hogar() {
  const m = await requireMember();
  const [members, accounts, balances, all] = await Promise.all([
    db.member.findMany({ where: { householdId: m.householdId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, role: true } }),
    db.account.findMany({ where: { householdId: m.householdId, ownerMemberId: m.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, type: true, currency: true, openingBalance: true } }),
    accountBalances(m.householdId),
    listMemberships(m.userId),
  ]);

  return (
    <div>
      <PageHeader title="Hogar" />

      <HeroCard>
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-mint"><Icon name="home" className="h-6 w-6" /></span>
          <div className="min-w-0"><p className="text-sm text-white/70">Tu hogar</p><p className="truncate text-xl font-extrabold tracking-tight">{m.household.name}</p></div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <AvatarStack names={members.map((x) => x.name)} />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-mint/20 px-3 py-1 text-xs font-semibold text-mint">
            <span className="h-1.5 w-1.5 rounded-full bg-mint" />{members.length} {members.length === 1 ? "miembro" : "miembros"}
          </span>
        </div>
        <p className="mt-3 text-sm text-white/80">{members.map((x) => `${x.name}${isAdmin(x.role) ? " (admin)" : ""}`).join(" · ")}</p>
      </HeroCard>

      <div className="card mt-4 border border-mint/60">
        <div className="flex items-center gap-3">
          <IconTile icon="users" tone="green" />
          <div><p className="font-bold">Código de invitación</p><p className="text-xs text-muted">Compartilo para sumar a otra persona</p></div>
        </div>
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-mint-soft p-3">
          <code className="min-w-0 flex-1 select-all truncate font-mono text-sm font-semibold text-primary">{m.household.inviteCode}</code>
          <CopyButton text={m.household.inviteCode} />
        </div>
      </div>

      <SectionHeader title="Mis cuentas" action={<Link href="/cuentas" className="inline-flex items-center gap-1 text-sm font-semibold text-primary"><Icon name="plus" className="h-4 w-4" />Añadir</Link>} />
      {accounts.length === 0 ? (
        <div className="card text-center text-sm text-muted">Todavía no tenés cuentas en este hogar. <Link href="/cuentas" className="font-semibold text-primary">Creá una</Link></div>
      ) : (
        <ul className="card divide-y divide-line py-1">
          {accounts.map((a) => {
            const v = ACCOUNT_VISUAL[a.type] ?? ACCOUNT_VISUAL.BANK;
            return (
              <li key={a.id} className="flex items-center gap-3.5 py-3.5">
                <IconTile icon={v.icon} tone={v.tone} />
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{a.name}</span><span className="text-xs text-muted">Personal</span></span>
                <span className="font-bold tabular-nums">{money(balances.get(a.id) ?? a.openingBalance, a.currency)}</span>
              </li>
            );
          })}
        </ul>
      )}

      <SectionHeader title="Secciones" />
      <ul className="card divide-y divide-line py-1">
        {LINKS.map(([href, label, icon, tone, hint]) => (
          <li key={href}>
            <Link href={href} className="flex items-center gap-3.5 py-3.5">
              <IconTile icon={icon} tone={tone} />
              <span className="min-w-0 flex-1"><span className="block font-semibold">{label}</span><span className="text-xs text-muted">{hint}</span></span>
              <Icon name="chevronRight" className="h-4 w-4 text-muted" />
            </Link>
          </li>
        ))}
      </ul>

      <SectionHeader title="Tus hogares" />
      <div className="card p-3"><HouseholdSwitcher currentId={m.householdId} all={all} /></div>

      <div className="card mt-4 flex items-center gap-3.5">
        <Avatar name={m.name || m.email} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{m.name || m.email}</p>
          <p className="truncate text-xs text-muted">{m.email}</p>
          <p className="text-xs text-muted">{roleLabel(m.role)} en {m.household.name}</p>
        </div>
      </div>
      <form action={logout} className="mt-3">
        <button className="card flex w-full items-center gap-3 font-semibold text-neg hover:bg-[#FDECEE]/40"><Icon name="logout" className="h-5 w-5" />Cerrar sesión</button>
      </form>
    </div>
  );
}
