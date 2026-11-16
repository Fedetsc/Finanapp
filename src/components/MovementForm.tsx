"use client";
import { useState } from "react";
import { categoryVisual } from "@/lib/visuals";
import { convert, currencyName, currencySymbol, money, parseRate, rateQuote } from "@/lib/currency";
import { toCents } from "@/lib/util";
import { Icon, TONES } from "./ui";
import SubmitButton from "./SubmitButton";

type Opt = { id: string; name: string };
type Acc = Opt & { currency: string };
/** Nombre de la cuenta con su moneda si no es ARS: "Wise · USD". */
const accLabel = (a: Acc) => (a.currency === "ARS" ? a.name : `${a.name} · ${currencyName(a.currency)}`);
type Kind = "EXPENSE" | "INCOME" | "TRANSFER";

const TABS: [Kind, string][] = [["EXPENSE", "Gasto"], ["INCOME", "Ingreso"], ["TRANSFER", "Transferencia"]];

/**
 * mine: cuentas propias (únicas válidas como cuenta del gasto/ingreso u origen).
 * others: cuentas de otros miembros, agrupadas por dueño (solo como destino de transferencia).
 */
export default function MovementForm({ action, mine, others, categories, today, me }: {
  action: (fd: FormData) => void;
  mine: Acc[];
  others: { owner: string; accounts: Acc[] }[];
  categories: Opt[];
  today: string;
  me: string;
}) {
  const [kind, setKind] = useState<Kind>("EXPENSE");
  const [from, setFrom] = useState(mine[0]?.id ?? ""); // cuenta del gasto/ingreso u origen de la transferencia
  const [toSel, setToSel] = useState("");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  const transfer = kind === "TRANSFER";
  const destMine = mine.filter((a) => a.id !== from);
  const dests = [...destMine, ...others.flatMap((o) => o.accounts)];
  const hasDest = dests.length > 0;
  const fromAcc = mine.find((a) => a.id === from) ?? mine[0];
  const toAcc = dests.find((a) => a.id === toSel) ?? dests[0];
  const cur = fromAcc?.currency ?? "ARS";
  // Transferencia entre monedas distintas: se pide el tipo de cambio y se muestra cuánto llega.
  const fx = transfer && toAcc && fromAcc && toAcc.currency !== fromAcc.currency ? rateQuote(fromAcc.currency, toAcc.currency) : null;
  let arrives: string | null = null;
  if (fx && amount && rate) {
    try { arrives = money(convert(toCents(amount), fromAcc!.currency, toAcc!.currency, parseRate(rate)), toAcc!.currency); } catch { arrives = null; }
  }

  const sel = "input !rounded-xl !px-2.5 !py-2 text-xs";
  return (
    <form id="nuevo" action={action} className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Tipo de movimiento" className="grid grid-cols-3 gap-1 rounded-2xl bg-surface p-1 shadow-soft">
        {TABS.map(([v, l]) => (
          <label key={v} className="cursor-pointer">
            <input type="radio" name="type" value={v} checked={kind === v} onChange={() => setKind(v)} className="peer sr-only" />
            <span className="block rounded-xl py-2 text-center text-sm font-semibold text-muted transition peer-checked:bg-primary peer-checked:text-white peer-focus-visible:ring-4 peer-focus-visible:ring-primary/20">{l}</span>
          </label>
        ))}
      </div>

      <label className="flex items-baseline justify-center gap-1.5 rounded-2xl bg-surface px-4 py-1.5 shadow-soft">
        <span className="whitespace-nowrap text-xl font-bold text-muted" aria-hidden="true">{currencySymbol(cur)}</span>
        <input id="amount" name="amount" required inputMode="decimal" autoComplete="off" placeholder="0" aria-label={`Monto en ${currencyName(cur)}`}
          value={amount} onChange={(e) => setAmount(e.target.value)}
          style={{ width: `${Math.max(1, amount.length) + 0.6}ch` }}
          className="min-w-0 max-w-[80%] bg-transparent text-[32px] font-extrabold leading-tight tracking-tight text-text placeholder:text-muted/40 focus:outline-none" />
      </label>

      {/* Fecha · miembro · cuenta (origen, si es transferencia) en una fila */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1.3fr)] gap-2">
        <label className="min-w-0"><span className="label !mb-1 text-[11px]">Fecha</span>
          <input name="date" type="date" required defaultValue={today} className={`${sel} w-[7.6rem]`} />
        </label>
        <label className="min-w-0"><span className="label !mb-1 text-[11px]">Miembro</span>
          {/* Siempre quien está logueado: solo se registran movimientos en cuentas propias. */}
          <select disabled aria-label="Miembro" className={`${sel} truncate opacity-100`} value="me" onChange={() => {}}><option value="me">{me}</option></select>
        </label>
        <label className="min-w-0"><span className="label !mb-1 text-[11px]">{transfer ? "Desde" : "Cuenta"}</span>
          <select name="accountId" required value={fromAcc?.id ?? ""} onChange={(e) => setFrom(e.target.value)} className={`${sel} truncate`}>
            {mine.map((a) => <option key={a.id} value={a.id}>{accLabel(a)}</option>)}
          </select>
        </label>
      </div>

      {transfer ? (
        <>
          <label className="block"><span className="label !mb-1 text-[11px]">Hacia</span>
            <select id="toAccountId" name="toAccountId" required className={sel} value={toAcc?.id ?? ""} onChange={(e) => setToSel(e.target.value)}>
              {!hasDest && <option value="">No hay otra cuenta en el hogar</option>}
              {destMine.length > 0 && <optgroup label="Mis cuentas">{destMine.map((a) => <option key={a.id} value={a.id}>{accLabel(a)}</option>)}</optgroup>}
              {others.filter((o) => o.accounts.length).map((o) => <optgroup key={o.owner} label={`De ${o.owner}`}>{o.accounts.map((a) => <option key={a.id} value={a.id}>{accLabel(a)}</option>)}</optgroup>)}
            </select>
          </label>
          {fx && (
            <div className="space-y-1.5 rounded-2xl bg-surface p-3 shadow-soft">
              <label htmlFor="exchangeRate" className="block text-sm font-bold">¿A cuánto lo tomás?</label>
              <div className="flex items-center gap-2 text-sm">
                <span className="shrink-0 font-semibold">1 {currencyName(fx.base)} =</span>
                <span className="shrink-0 text-muted">{currencySymbol(fx.quote)}</span>
                <input id="exchangeRate" name="exchangeRate" required inputMode="decimal" autoComplete="off" placeholder="Ej. 1.250,50"
                  value={rate} onChange={(e) => setRate(e.target.value)} className={`${sel} min-w-0 flex-1 !text-sm`} />
              </div>
              <p className="text-xs text-muted" aria-live="polite">
                {arrives ? <>Llegan <b className="text-text">{arrives}</b> a {toAcc!.name}.</> : `Sale en ${currencyName(fromAcc!.currency)} y llega en ${currencyName(toAcc!.currency)}. El tipo de cambio queda guardado en la transferencia.`}
              </p>
            </div>
          )}
        </>
      ) : (
        <fieldset>
          <legend className="label !mb-1 text-[11px]">Categoría</legend>
          {categories.length === 0 ? (
            <p className="text-sm text-muted">Primero creá una categoría.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => {
                const v = categoryVisual(c.name, kind);
                return (
                  <label key={c.id} className="cursor-pointer" title={c.name}>
                    <input type="radio" name="categoryId" value={c.id} required className="peer sr-only" />
                    <span className="flex items-center gap-1 rounded-full border-2 border-transparent bg-surface py-0.5 pl-0.5 pr-2 text-[12px] font-semibold shadow-soft transition active:scale-95
                      peer-checked:border-pos peer-checked:bg-mint-soft peer-focus-visible:ring-4 peer-focus-visible:ring-primary/15">
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${TONES[v.tone]}`}><Icon name={v.icon} className="h-3 w-3" /></span>
                      <span className="whitespace-nowrap">{c.name}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>
      )}

      <label className="relative block">
        <Icon name="note" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input name="description" maxLength={120} aria-label="Nota" placeholder={transfer ? "Nota (opcional, por defecto «Transferencia»)" : "Nota (opcional)"} className="input !py-2.5 pl-10" />
      </label>

      {/* Guardar: siempre a la vista, encima del menú de abajo si la pantalla es muy chica. */}
      <div className="sticky bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-10 -mx-1 rounded-2xl bg-bg/90 px-1 pb-1 pt-1 backdrop-blur md:bottom-4">
        <SubmitButton className="btn w-full !py-3.5 text-base" pendingText="Guardando..."><Icon name="check" className="h-5 w-5" strokeWidth={2.6} />{transfer ? "Guardar transferencia" : "Guardar"}</SubmitButton>
      </div>
    </form>
  );
}
