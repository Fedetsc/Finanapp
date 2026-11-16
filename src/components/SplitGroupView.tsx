import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { money } from "@/lib/currency";
import { fdate, fmt, todayAR } from "@/lib/util";
import { balances, readShares, simplify, type Debt } from "@/lib/split-math";
import { addParticipant, deleteExpense, deleteGroup, moveToMovements, removeParticipant, saveExpense, settleAll, settleDebt, undoSettlement } from "@/lib/split-actions";
import { Avatar, Empty, HeroCard, Icon, Notice, PageHeader, SectionHeader } from "@/components/ui";
import Amt from "@/components/Amt";
import Err from "@/components/Err";
import SubmitButton from "@/components/SubmitButton";
import SplitExpenseForm, { type ExpenseInitial } from "@/components/SplitExpenseForm";

const OK: Record<string, string> = { gasto: "Gasto guardado.", saldada: "Listo, quedó como saldado.", movido: "Gasto pasado a los movimientos del hogar." };

export const GROUP_SELECT = {
  id: true, title: true, currency: true, status: true,
  participants: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, memberId: true } },
  expenses: { orderBy: [{ date: "desc" }, { createdAt: "desc" }], select: { id: true, description: true, amount: true, date: true, splitType: true, splitDetails: true, paidByParticipantId: true, movedTransactionId: true } },
  settlements: { orderBy: { createdAt: "desc" }, select: { id: true, fromParticipantId: true, toParticipantId: true, amount: true, createdAt: true } },
} satisfies Prisma.SplitGroupSelect;
export type GroupData = Prisma.SplitGroupGetPayload<{ select: typeof GROUP_SELECT }>;

/** Vista del detalle de una división (sin consultas: la página le pasa los datos). */
export default function SplitGroupView({ g, memberId, myAccounts, sp }: { g: GroupData; memberId: string; myAccounts: { id: string; name: string }[]; sp: { e?: string; ok?: string; editar?: string } }) {
  const ids = g.participants.map((p) => p.id);
  const nameOf = new Map(g.participants.map((p) => [p.id, p.name]));
  const me = g.participants.find((p) => p.memberId === memberId)?.id ?? null;
  const exps = g.expenses.map((e) => ({ paidBy: e.paidByParticipantId, amount: e.amount, shares: readShares(e.splitDetails) }));
  const settled: Debt[] = g.settlements.map((s) => ({ from: s.fromParticipantId, to: s.toParticipantId, amount: s.amount }));
  const bal = balances(ids, exps, settled);
  const pending = simplify(ids, new Map([...bal].map(([id, b]) => [id, b.net])));
  const total = exps.reduce((a, e) => a + e.amount, 0n);
  const used = new Set([...exps.flatMap((e) => [e.paidBy, ...Object.keys(e.shares)]), ...settled.flatMap((s) => [s.from, s.to])]);
  const cur = (c: bigint) => <Amt c={g.currency}>{money(c, g.currency)}</Amt>;
  const self = `/hogar/division/${g.id}`;
  const hidden = <input type="hidden" name="groupId" value={g.id} />;

  const editing = g.expenses.find((e) => e.id === sp.editar);
  let initial: ExpenseInitial | undefined;
  if (editing) {
    const d = (editing.splitDetails ?? {}) as { mode?: ExpenseInitial["mode"]; input?: Record<string, string> };
    initial = { id: editing.id, description: editing.description, amount: fmt(editing.amount).slice(1), paidBy: editing.paidByParticipantId, date: editing.date.toISOString().slice(0, 10), mode: d.mode ?? "equal", included: Object.keys(readShares(editing.splitDetails)), input: d.input ?? {} };
  }

  return (
    <div>
      <PageHeader title={g.title} back={{ href: "/hogar/division", label: "Divisiones" }} right={
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${g.status === "SETTLED" ? "bg-surface text-muted shadow-soft" : "bg-mint-soft text-pos"}`}>{g.status === "SETTLED" ? "Saldado" : "Activo"}</span>
      } />
      <Err e={sp.e} />
      {sp.ok && OK[sp.ok] && <Notice tone="ok">{OK[sp.ok]}</Notice>}

      <HeroCard>
        <p className="text-sm text-white/70">Total del grupo</p>
        <p className="text-3xl font-extrabold tracking-tight tabular-nums">{cur(total)}</p>
        <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5">
          {g.participants.map((p) => (
            <li key={p.id} className="flex min-w-0 items-center gap-2">
              <Avatar name={p.name} size="sm" />
              <span className="min-w-0"><span className="block truncate text-sm font-semibold">{p.name}</span><span className="block text-[11px] text-white/70 tabular-nums">Pagó {cur(bal.get(p.id)?.paid ?? 0n)}</span></span>
            </li>
          ))}
        </ul>
      </HeroCard>

      <section id="gasto" className="scroll-mt-6">
        {editing ? (
          <>
            <SectionHeader title="Editar gasto" />
            <div className="card"><SplitExpenseForm groupId={g.id} people={g.participants} currency={g.currency} today={todayAR()} me={me} initial={initial} cancelHref={self} action={saveExpense} /></div>
          </>
        ) : (
          <details className="card mt-4 group" open={g.expenses.length === 0}>
            <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-primary [&::-webkit-details-marker]:hidden">
              <Icon name="plus" className="h-5 w-5" />Agregar gasto<Icon name="chevronDown" className="ml-auto h-4 w-4 text-muted transition group-open:rotate-180" />
            </summary>
            <div className="mt-4"><SplitExpenseForm key={g.expenses.length} groupId={g.id} people={g.participants} currency={g.currency} today={todayAR()} me={me} action={saveExpense} /></div>
          </details>
        )}
      </section>

      <SectionHeader title="Gastos" />
      {g.expenses.length === 0 ? (
        <Empty icon="receipt">Todavía no hay gastos. Agregá el primero arriba.</Empty>
      ) : (
        <ul className="card divide-y divide-line py-1">
          {g.expenses.map((e) => {
            const n = Object.keys(readShares(e.splitDetails)).length;
            const canMove = !e.movedTransactionId && me !== null && e.paidByParticipantId === me && myAccounts.length > 0;
            return (
              <li key={e.id} className="py-3.5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{e.description}</p>
                    <p className="text-xs text-muted">Pagó {nameOf.get(e.paidByParticipantId)} · {fdate(e.date)} · {e.splitType === "EQUAL" ? `iguales entre ${n}` : "personalizado"}</p>
                  </div>
                  <span className="font-bold tabular-nums">{cur(e.amount)}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium">
                  <Link href={`${self}?editar=${e.id}#gasto`} className="inline-flex items-center gap-1 text-primary"><Icon name="pencil" className="h-3.5 w-3.5" />Editar</Link>
                  <form action={deleteExpense}>{hidden}<input type="hidden" name="id" value={e.id} /><SubmitButton className="inline-flex items-center gap-1 text-muted hover:text-neg" pendingText="Borrando...">Borrar</SubmitButton></form>
                  {e.movedTransactionId && <span className="inline-flex items-center gap-1 text-pos"><Icon name="check" className="h-3.5 w-3.5" />En movimientos del hogar</span>}
                  {canMove && (
                    <details className="w-full">
                      <summary className="cursor-pointer text-muted hover:text-text">Pasar a movimientos del hogar (opcional)</summary>
                      <form action={moveToMovements} className="mt-2 flex gap-2">
                        {hidden}<input type="hidden" name="id" value={e.id} />
                        <select name="accountId" aria-label="Cuenta" className="input !py-2 text-sm">{myAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
                        <SubmitButton className="btn shrink-0 px-3 py-2 text-xs" pendingText="...">Crear gasto</SubmitButton>
                      </form>
                      <p className="mt-1 text-[11px] text-muted">Crea un gasto real de {money(e.amount, g.currency)} con fecha de hoy en tu cuenta. Solo una vez.</p>
                    </details>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <SectionHeader title="Quién le debe a quién" />
      <div className="card space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead><tr className="text-left text-xs text-muted"><th className="pb-2 font-medium">Persona</th><th className="pb-2 text-right font-medium">Pagó</th><th className="pb-2 text-right font-medium">Su parte</th><th className="pb-2 text-right font-medium">Pendiente</th></tr></thead>
            <tbody className="divide-y divide-line">
              {g.participants.map((p) => {
                const b = bal.get(p.id)!;
                return (
                  <tr key={p.id}>
                    <td className="max-w-[7rem] truncate py-2 font-semibold">{p.name}</td>
                    <td className="py-2 text-right">{cur(b.paid)}</td>
                    <td className="py-2 text-right text-muted">{cur(b.owed)}</td>
                    <td className={`py-2 text-right font-bold ${b.net > 0n ? "text-pos" : b.net < 0n ? "text-neg" : "text-muted"}`}>{b.net === 0n ? "—" : <>{b.net > 0n ? "+" : "−"}{cur(b.net < 0n ? -b.net : b.net)}</>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-muted">Pendiente: <span className="text-pos">+ le deben</span> · <span className="text-neg">− debe</span>. Cuenta los pagos ya saldados.</p>
        </div>

        {pending.length === 0 ? (
          <p className="flex items-center gap-2 rounded-2xl bg-mint-soft px-4 py-3 text-sm font-semibold text-pos"><Icon name="check" className="h-4 w-4" />{g.expenses.length ? "Están todos a mano." : "Cuando cargues gastos, acá aparecen las deudas."}</p>
        ) : (
          <>
            <ul className="space-y-2">
              {pending.map((d) => (
                <li key={`${d.from}-${d.to}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-bg px-3 py-3">
                  <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                    <span className="truncate font-semibold text-neg">{nameOf.get(d.from)}</span>
                    <Icon name="arrowRight" className="h-4 w-4 shrink-0 text-muted" />
                    <span className="truncate font-semibold text-pos">{nameOf.get(d.to)}</span>
                  </span>
                  <span className="font-extrabold tabular-nums">{cur(d.amount)}</span>
                  <form action={settleDebt} className="w-full sm:w-auto">
                    {hidden}<input type="hidden" name="from" value={d.from} /><input type="hidden" name="to" value={d.to} />
                    <SubmitButton className="btn-ghost w-full justify-center px-3 py-1.5 text-xs sm:w-auto" pendingText="...">Marcar como saldado</SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-muted">Simplificado: la menor cantidad de pagos para quedar a mano. Es solo una cuenta: no mueve plata ni toca tus saldos.</p>
            {pending.length > 1 && <form action={settleAll}>{hidden}<SubmitButton className="btn w-full" pendingText="Saldando...">Saldar todo</SubmitButton></form>}
          </>
        )}
      </div>

      <SectionHeader title="Personas" />
      <div className="card space-y-3">
        <ul className="flex flex-wrap gap-2">
          {g.participants.map((p) => (
            <li key={p.id} className="inline-flex items-center gap-2 rounded-full bg-bg py-1 pl-1 pr-2 text-sm font-semibold">
              <Avatar name={p.name} size="sm" />{p.name}
              {!used.has(p.id) && (
                <form action={removeParticipant} className="flex">{hidden}<input type="hidden" name="participantId" value={p.id} />
                  <SubmitButton className="rounded-full p-0.5 text-muted hover:text-neg" pendingText="…"><Icon name="x" className="h-3.5 w-3.5" /><span className="sr-only">Sacar a {p.name}</span></SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
        <form action={addParticipant} className="flex gap-2">
          {hidden}
          <input name="name" required maxLength={40} autoComplete="off" placeholder="Sumar a alguien (ej. Pedro)" aria-label="Nombre de la persona" className="input" />
          <SubmitButton className="btn-ghost shrink-0 px-4" pendingText="..."><Icon name="plus" className="h-4 w-4" />Agregar</SubmitButton>
        </form>
        <p className="text-[11px] text-muted">Sumar a alguien no cambia los gastos ya cargados. Solo se puede sacar a quien no participa de ningún gasto.</p>
      </div>

      {g.settlements.length > 0 && (
        <>
          <SectionHeader title="Historial de pagos" />
          <ul className="card divide-y divide-line py-1">
            {g.settlements.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-3 text-sm">
                <Icon name="check" className="h-4 w-4 shrink-0 text-pos" />
                <span className="min-w-0 flex-1"><b>{nameOf.get(s.fromParticipantId)}</b> le pagó {cur(s.amount)} a <b>{nameOf.get(s.toParticipantId)}</b><span className="block text-xs text-muted">{fdate(s.createdAt)}</span></span>
                <form action={undoSettlement}>{hidden}<input type="hidden" name="id" value={s.id} /><SubmitButton className="text-xs font-medium text-muted hover:text-neg" pendingText="...">Deshacer</SubmitButton></form>
              </li>
            ))}
          </ul>
        </>
      )}

      <details className="mt-8 px-1 text-sm">
        <summary className="cursor-pointer text-muted hover:text-neg">Borrar esta división</summary>
        <form action={deleteGroup} className="card mt-2 flex items-center gap-3">
          {hidden}
          <p className="min-w-0 flex-1 text-xs text-muted">Se borran sus gastos y pagos. No toca los movimientos del hogar.</p>
          <SubmitButton className="btn shrink-0 !bg-neg px-4 py-2 text-xs" pendingText="Borrando...">Borrar</SubmitButton>
        </form>
      </details>
    </div>
  );
}
