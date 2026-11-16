import Link from "next/link";
import { db } from "@/lib/db";
import { listMemberships, requireMember, roleLabel, isAdmin } from "@/lib/session";
import { logout } from "@/lib/household-actions";
import { accountBalances } from "@/lib/balances";
import { money } from "@/lib/currency";
import { arsEquivalent, referenceRates } from "@/lib/rates";
import { ACCOUNT_VISUAL } from "@/lib/visuals";
import HouseholdSwitcher from "@/components/HouseholdSwitcher";
import CopyButton from "@/components/CopyButton";
import { Avatar, AvatarStack, HeroCard, Icon, IconTile, PageHeader, SectionHeader } from "@/components/ui";
import Amt, { MASK } from "@/components/Amt";

type Tile = readonly [href: string, label: string, icon: string, tone: "blue" | "green" | "violet" | "orange" | "pink", hint: string];
const LINKS: Tile[] = [
  ["/cuentas", "Cuentas", "bank", "blue", "Saldos de cada cuenta"],
  ["/ahorro", "Ahorro", "piggy", "green", "Plata apartada"],
  ["/tarjetas", "Tarjetas", "card", "violet", "Compras en cuotas"],
  ["/suscripciones", "Suscripciones", "repeat", "orange", "Cobros automáticos"],
  ["/categorias", "Categorías", "tag", "pink", "Para clasificar gastos"],
];
const TOOLS: Tile[] = [
  ["/hogar/objetivo", "Objetivo de gastos mensuales", "target", "green", "Límite mensual por hogar o por miembro"],
  ["/hogar/division", "División de gastos", "split", "violet", "Quién le debe a quién, estilo SplitWise"],
];

/** Lista de cards que llevan a otra página (Secciones y Herramientas). */
function LinkList({ items }: { items: Tile[] }) {
  return (
    <ul className="card divide-y divide-line py-1">
      {items.map(([href, label, icon, tone, hint]) => (
        <li key={href}>
          <Link href={href} className="flex items-center gap-3.5 py-3.5">
            <IconTile icon={icon} tone={tone} />
            <span className="min-w-0 flex-1"><span className="block font-semibold">{label}</span><span className="text-xs text-muted">{hint}</span></span>
            <Icon name="chevronRight" className="h-4 w-4 text-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Hub del hogar. Orden: Tu hogar, Mis cuentas, Secciones, Herramientas, Tus hogares, Código de invitación, Cuenta. */
export default async function Hogar() {
  const m = await requireMember();
  const [members, accounts, balances, all, rates] = await Promise.all([
    db.member.findMany({ where: { householdId: m.householdId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, role: true } }),
    db.account.findMany({ where: { householdId: m.householdId, ownerMemberId: m.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, type: true, currency: true, openingBalance: true } }),
    accountBalances(m.householdId),
    listMemberships(m.userId),
    referenceRates(m.householdId),
  ]);

  return (
    <div>
      <PageHeader title="Hogar" />

      <HeroCard>
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-mint"><Icon name="home" className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1"><p className="text-sm text-white/70">Tu hogar</p><p className="truncate text-xl font-extrabold tracking-tight">{m.household.name}</p></div>
          {all.length > 1 && <a href="#hogares" className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/85 transition hover:bg-white/20">Cambiar</a>}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <AvatarStack names={members.map((x) => x.name)} />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-mint/20 px-3 py-1 text-xs font-semibold text-mint">
            <span className="h-1.5 w-1.5 rounded-full bg-mint" />{members.length} {members.length === 1 ? "miembro" : "miembros"}
          </span>
        </div>
        <p className="mt-3 text-sm text-white/80">{members.map((x) => `${x.name}${isAdmin(x.role) ? " (admin)" : ""}`).join(" · ")}</p>
      </HeroCard>

      <SectionHeader title="Mis cuentas" action={<Link href="/cuentas" className="inline-flex items-center gap-1 text-sm font-semibold text-primary"><Icon name="plus" className="h-4 w-4" />Añadir</Link>} />
      {accounts.length === 0 ? (
        <div className="card text-center text-sm text-muted">Todavía no tenés cuentas en este hogar. <Link href="/cuentas" className="font-semibold text-primary">Creá una</Link></div>
      ) : (
        <ul className="card divide-y divide-line py-1">
          {accounts.map((a) => {
            const v = ACCOUNT_VISUAL[a.type] ?? ACCOUNT_VISUAL.BANK;
            const bal = balances.get(a.id) ?? a.openingBalance;
            const ars = arsEquivalent(bal, a.currency, rates);
            return (
              <li key={a.id} className="flex items-center gap-3.5 py-3.5">
                <IconTile icon={v.icon} tone={v.tone} />
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{a.name}</span><span className="text-xs text-muted">Personal</span></span>
                <span className="flex flex-col items-end">
                  <span className="font-bold tabular-nums"><Amt c={a.currency}>{money(bal, a.currency)}</Amt></span>
                  {ars && <span className="text-[11px] text-muted tabular-nums"><Amt mask={`≈ $ ${MASK}`}>{ars}</Amt></span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <SectionHeader title="Secciones" />
      <LinkList items={LINKS} />

      <SectionHeader title="Herramientas" />
      <LinkList items={TOOLS} />

      <section id="hogares" className="scroll-mt-6">
        <SectionHeader title="Tus hogares" />
        <div className="card p-3"><HouseholdSwitcher currentId={m.householdId} all={all} /></div>
      </section>

      <SectionHeader title="Código de invitación" />
      <div className="card">
        <p className="text-xs text-muted">Compartilo para sumar a otra persona a {m.household.name}</p>
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-mint-soft p-3">
          <code className="min-w-0 flex-1 select-all truncate font-mono text-sm font-semibold text-primary">{m.household.inviteCode}</code>
          <CopyButton text={m.household.inviteCode} />
        </div>
      </div>

      <SectionHeader title="Cuenta" />
      <div className="card flex items-center gap-3.5">
        <Avatar name={m.name || m.email} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{m.name || m.email}</p>
          <p className="truncate text-xs text-muted">{m.email}</p>
          <p className="text-xs text-muted">{roleLabel(m.role)} en {m.household.name}</p>
        </div>
      </div>
      <form action={logout} className="mt-3">
        <button className="card flex w-full items-center gap-3 font-semibold text-neg hover:bg-[#FDECEE]/40 dark:hover:bg-neg/10"><Icon name="logout" className="h-5 w-5" />Cerrar sesión</button>
      </form>
    </div>
  );
}
