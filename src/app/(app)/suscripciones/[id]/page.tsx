import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { fdate, fmt } from "@/lib/util";
import { money } from "@/lib/currency";
import { CYCLES } from "@/lib/dates";
import { today } from "@/lib/billing";
import { changeSubscriptionAmount, chargeSubscription } from "@/lib/subscription-actions";
import SubscriptionActions from "@/components/SubscriptionActions";
import Err from "@/components/Err";
import Amt from "@/components/Amt";
import { HeroCard, Notice, PageHeader } from "@/components/ui";

/** Detalle de una suscripción: datos, botones de cobro y el historial de cobros y de cambios de monto. */
export default async function Suscripcion({ params, searchParams }: { params: { id: string }; searchParams: { e?: string; cobrada?: string; monto?: string } }) {
  const m = await requireMember();
  const s = await db.subscription.findFirst({
    where: { id: params.id, householdId: m.householdId },
    include: {
      account: { select: { name: true } },
      member: { select: { name: true } },
      charges: { orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 60, select: { id: true, date: true, amount: true, voidedAt: true, account: { select: { name: true, currency: true } } } },
      changes: { orderBy: { createdAt: "desc" }, take: 60 },
    },
  });
  if (!s) notFound();
  const own = s.memberId === m.id;
  const back = `/suscripciones/${s.id}`;
  const t = today();
  const [accounts, members] = await Promise.all([
    db.account.findMany({ where: { householdId: m.householdId }, orderBy: { name: "asc" }, select: { id: true, name: true, currency: true, ownerMemberId: true } }),
    db.member.findMany({ where: { householdId: m.householdId }, select: { id: true, name: true } }),
  ]);
  const accName = new Map(accounts.map((a) => [a.id, a.name]));
  const memberName = new Map(members.map((x) => [x.id, x.name]));
  const todayCharge = s.charges.find((c) => c.date.getTime() === t.getTime());
  const chargedToday = !todayCharge ? "no" : todayCharge.voidedAt ? "anulado" : "cobrado";
  const cur = s.currency;

  return (
    <div className="space-y-4">
      <PageHeader back={{ href: "/suscripciones", label: "Suscripciones" }} title={s.name} subtitle={`${CYCLES[s.cycle]} · ${s.account.name} · ${s.member.name}${s.isActive ? "" : " · Pausada"}`} />
      <Err e={searchParams.e} />
      {searchParams.cobrada && <Notice tone="ok">Cobro registrado: ya está en Movimientos y bajó el saldo de la cuenta.</Notice>}
      {searchParams.monto && <Notice tone="ok">Monto actualizado para el próximo cobro.</Notice>}

      <HeroCard>
        <p className="text-sm text-white/70">Monto a cobrar</p>
        <p className="mt-1 text-[34px] font-extrabold leading-none tracking-tight tabular-nums"><Amt c={cur}>{money(s.amount, cur)}</Amt></p>
        <p className="mt-2 text-xs text-white/70">
          {s.isActive ? <>Próximo cobro sugerido: {fdate(s.nextPaymentDate)}</> : "Pausada"} · Último cobro: {s.lastChargedDate ? fdate(s.lastChargedDate) : "todavía no"}
        </p>
      </HeroCard>

      {own && s.isActive && (
        <div className="card">
          <SubscriptionActions sub={{ id: s.id, name: s.name, amount: fmt(s.amount).slice(1), currency: cur, accountId: s.accountId, owner: s.member.name }}
            accounts={accounts.filter((a) => a.ownerMemberId === m.id).map(({ id, name, currency }) => ({ id, name, currency }))}
            chargedToday={chargedToday} back={back} changeAction={changeSubscriptionAmount} chargeAction={chargeSubscription} />
        </div>
      )}

      <section className="space-y-2">
        <h2 className="px-1 font-bold">Historial de cobros</h2>
        {s.charges.length === 0 ? (
          <p className="card text-center text-sm text-muted">Todavía no se cobró.</p>
        ) : (
          <ul className="card divide-y divide-line py-1">
            {s.charges.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="min-w-0">
                  <span className={`block font-semibold ${c.voidedAt ? "text-muted line-through" : ""}`}>{fdate(c.date)}</span>
                  <span className="text-xs text-muted">{c.account.name}{c.voidedAt ? " · Anulado" : ""}</span>
                </span>
                <span className={`shrink-0 font-bold tabular-nums ${c.voidedAt ? "text-muted line-through" : "text-neg"}`}>-<Amt c={c.account.currency}>{money(c.amount, c.account.currency)}</Amt></span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="px-1 font-bold">Cambios de monto</h2>
        {s.changes.length === 0 ? (
          <p className="card text-center text-sm text-muted">El monto no cambió desde que se creó.</p>
        ) : (
          <ul className="card divide-y divide-line py-1">
            {s.changes.map((c) => (
              <li key={c.id} className="space-y-0.5 py-3 text-sm">
                <p className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{fdate(c.createdAt)}</span>
                  <span className="tabular-nums"><span className="text-muted line-through"><Amt c={cur}>{money(c.oldAmount, cur)}</Amt></span> → <b><Amt c={cur}>{money(c.newAmount, cur)}</Amt></b></span>
                </p>
                <p className="text-xs text-muted">
                  {[memberName.get(c.memberId), c.newAccountId && `Cuenta: ${accName.get(c.oldAccountId ?? "") ?? "otra"} → ${accName.get(c.newAccountId) ?? "otra"}`, c.note].filter(Boolean).join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
