// Vista de Inicio (sin consultas: la página le pasa los datos ya calculados).
import Link from "next/link";
import HideAmountsToggle from "./HideAmounts";
import { HeroCard, Icon } from "./ui";
import Amt, { MASK } from "./Amt";
import GoalBar from "./GoalBar";
import GoalAlerts, { type GoalAlert } from "./GoalAlerts";
import SubsQuickPay, { type QuickSub } from "./SubsQuickPay";
import MovementRow, { type RowTx } from "./MovementRow";
import NoPageScroll from "./NoPageScroll";
import { fmt } from "@/lib/util";
import { money } from "@/lib/currency";
import { paySubscriptionQuick } from "@/lib/subscription-actions";
import type { GoalView } from "@/lib/goals";

type Person = { id: string; name: string; ars: bigint; foreign: [string, bigint][] };
export type HomeData = {
  alerts: GoalAlert[]; monthNum: string; foreignTotals: [string, bigint][]; total: bigint; balance: bigint; disponible: bigint; ahorrado: bigint;
  people: Person[]; hGoal: GoalView | undefined; mGoals: GoalView[]; nameOf: Map<string, string>;
  quickSubs: QuickSub[]; ownAccounts: { id: string; name: string; currency: string }[]; defaultPayAccount: string;
  recent: (RowTx & { date: Date })[]; dayLabel: (d: Date) => string; shortSymbol: (c: string) => string; shortMoney: (v: bigint, c: string) => string;
};

export default function HomeView({ v, payAction = paySubscriptionQuick }: { v: HomeData; payAction?: typeof paySubscriptionQuick }) {
  const { alerts, monthNum, foreignTotals, total, balance, disponible, ahorrado, people, hGoal, mGoals, nameOf, quickSubs, ownAccounts, defaultPayAccount, recent, dayLabel, shortSymbol, shortMoney } = v;
  return (
    <div className="-mb-32 -mt-6 flex h-[100dvh] flex-col gap-2 overflow-hidden pb-[calc(5.25rem+env(safe-area-inset-bottom))] pt-2.5 md:m-0 md:h-auto md:gap-4 md:overflow-visible md:p-0">
      <NoPageScroll />
      <GoalAlerts alerts={alerts} />

      <HeroCard className="shrink-0 !rounded-[20px] !p-3.5">
        {/* 3. Mes y año en números + ojito */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold tabular-nums text-white/60">{monthNum}</p>
          <HideAmountsToggle tone="light" className="!h-7 !w-7" />
        </div>
        <p className="-mt-1 text-xs text-white/70">{foreignTotals.length ? "Total ARS" : "Saldo total"}</p>
        <p className="text-[27px] font-extrabold leading-none tracking-tight tabular-nums"><Amt>{fmt(total)}</Amt></p>
        <span className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${balance >= 0n ? "bg-mint/20 text-mint" : "bg-[#FDECEE]/20 text-[#FFB3B6]"}`}>
          <Icon name="trend" className="h-3 w-3" />{balance >= 0n ? "+" : ""}<Amt>{fmt(balance)}</Amt> este mes
        </span>
        <dl className="mt-2 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-white/10 px-2.5 py-1.5"><dt className="text-[10px] text-white/60">Disponible para gastar</dt><dd className="text-sm font-bold tabular-nums"><Amt>{fmt(disponible)}</Amt></dd></div>
          <div className="rounded-xl bg-white/10 px-2.5 py-1.5"><dt className="text-[10px] text-white/60">Ahorrado</dt><dd className="text-sm font-bold tabular-nums"><Amt>{fmt(ahorrado)}</Amt></dd></div>
        </dl>
        <div className="mt-2 border-t border-white/15 pt-2">
          <p className="text-[10px] text-white/60">En las cuentas de cada uno</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {people.map((p) => (
              <li key={p.id} className="flex min-w-0 items-baseline gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-xs">
                <span className="truncate text-white/75">{p.name}</span>
                <b className="tabular-nums"><Amt>{fmt(p.ars)}</Amt></b>
                {p.foreign.map(([c, v]) => <span key={c} className="text-xs text-white/60 tabular-nums">· <Amt c={c}>{money(v, c)}</Amt></span>)}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-2 flex items-end justify-between gap-3 border-t border-white/15 pt-2">
          <div className="min-w-0 flex-1">
          {hGoal || mGoals.length ? (
            <div className="space-y-1.5">
              {hGoal && (
                <div>
                  <p className="flex items-baseline justify-between gap-x-2 whitespace-nowrap text-[10px] text-white/70">
                    <span className="min-w-0 truncate">Hogar: <b className="text-white tabular-nums"><Amt c={hGoal.currency}>{money(hGoal.spent, hGoal.currency)}</Amt></b> / <span className="tabular-nums"><Amt c={hGoal.currency}>{money(hGoal.amount, hGoal.currency)}</Amt></span></span>
                    <span className={`shrink-0 ${hGoal.remaining < 0n ? "font-semibold text-[#FFB3B6]" : "text-white/80"}`}>{hGoal.remaining >= 0n ? "Queda " : "Te pasaste "}<b className="tabular-nums"><Amt c={hGoal.currency}>{money(hGoal.remaining >= 0n ? hGoal.remaining : -hGoal.remaining, hGoal.currency)}</Amt></b></span>
                  </p>
                  <div className="mt-1"><GoalBar pct={hGoal.pct} level={hGoal.level} tone="light" size="sm" label="Objetivo de gastos del hogar" /></div>
                </div>
              )}
              {mGoals.length > 0 && (
                <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {mGoals.map((g) => (
                    <li key={g.id} className="min-w-0">
                      <p className="truncate text-[10px] text-white/70"><span className="text-white/90">{nameOf.get(g.memberId!)}</span>: <span className="tabular-nums"><Amt c={g.currency}>{money(g.spent, g.currency)}</Amt></span> de <span className="tabular-nums"><Amt c={g.currency}>{money(g.amount, g.currency)}</Amt></span></p>
                      <div className="mt-0.5"><GoalBar pct={g.pct} level={g.level} tone="light" size="sm" label={`Objetivo de ${nameOf.get(g.memberId!)}`} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <Link href="/hogar/objetivo" className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/85 transition hover:bg-white/20 active:scale-95">
              <Icon name="target" className="h-3.5 w-3.5" />Definir objetivo
            </Link>
          )}
          </div>
          {/* 5. Saldo en otras monedas: chiquito, abajo a la derecha, sin etiqueta */}
          {foreignTotals.length > 0 && (
            <p className="shrink-0 text-right text-[11px] leading-tight text-white/55 tabular-nums">
              {foreignTotals.map(([c, v]) => <span key={c} className="block"><Amt c={c} mask={`${shortSymbol(c)} ${MASK}`}>{shortMoney(v, c)}</Amt></span>)}
            </p>
          )}
        </div>
      </HeroCard>

      <SubsQuickPay subs={quickSubs} accounts={ownAccounts} defaultAccountId={defaultPayAccount} action={payAction} />

      {/* Últimos movimientos: máximo 3; si la pantalla es muy baja, se recorta esta sección (la página no scrollea). */}
      <section className="card flex min-h-0 shrink flex-col !py-2.5">
        <div className="flex shrink-0 items-center justify-between">
          <h2 className="text-sm font-bold">Últimos movimientos</h2>
          <Link href="/movimientos" className="text-xs font-semibold text-primary">Ver todos →</Link>
        </div>
        {recent.length === 0
          ? <p className="py-3 text-center text-sm text-muted">Todavía no hay movimientos.</p>
          : <ul className="min-h-0 divide-y divide-line overflow-hidden">{recent.map((t) => <li key={t.id}><MovementRow t={t} when={dayLabel(t.date)} compact /></li>)}</ul>}
      </section>
    </div>
  );
}
