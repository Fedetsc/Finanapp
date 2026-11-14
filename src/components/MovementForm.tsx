"use client";
import { useState } from "react";
import { categoryVisual } from "@/lib/visuals";
import { convert, currencyName, currencySymbol, money, parseRate, rateQuote } from "@/lib/currency";
import { toCents } from "@/lib/util";
import { Icon, IconTile } from "./ui";
import SubmitButton from "./SubmitButton";

type Opt = { id: string; name: string };
type Acc = Opt & { currency: string };
/** Nombre de la cuenta con su moneda si no es ARS: "Wise · USD". */
const accLabel = (a: Acc) => (a.currency === "ARS" ? a.name : `${a.name} · ${currencyName(a.currency)}`);
type Kind = "EXPENSE" | "INCOME" | "TRANSFER";

const TABS: [Kind, string][] = [["EXPENSE", "Gasto"], ["INCOME", "Ingreso"], ["TRANSFER", "Transferencia"]];

/** Tarjetita seleccionable (radio) con ícono, como las de Categoría/Cuenta del ejemplo. */
function Tile({ name, value, label, icon, tone, checked, defaultChecked, onChange, required, layout = "col" }: {
  name: string; value: string; label: string; icon: string; tone: Parameters<typeof IconTile>[0]["tone"];
  checked?: boolean; defaultChecked?: boolean; onChange?: () => void; required?: boolean; layout?: "col" | "row";
}) {
  return (
    <label className="block cursor-pointer">
      <input type="radio" name={name} value={value} checked={checked} defaultChecked={defaultChecked} onChange={onChange} required={required} className="peer sr-only" />
      <span className={`flex h-full items-center gap-2 rounded-2xl border-2 border-transparent bg-surface p-3 text-center text-xs font-semibold shadow-soft transition
        peer-checked:border-pos peer-checked:bg-mint-soft peer-focus-visible:ring-4 peer-focus-visible:ring-primary/15 hover:bg-bg
        ${layout === "col" ? "flex-col justify-center" : "text-left text-sm"}`}>
        <IconTile icon={icon} tone={tone} size="sm" />
        <span className="line-clamp-2 min-w-0">{label}</span>
      </span>
    </label>
  );
}

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

  return (
    <form id="nuevo" action={action} className="scroll-mt-6 space-y-6 rounded-[24px] bg-surface/60 p-1">
      <h2 className="text-center text-lg font-bold">Añadir movimiento</h2>

      <div role="radiogroup" aria-label="Tipo de movimiento" className="grid grid-cols-3 gap-1 rounded-2xl bg-surface p-1 shadow-soft">
        {TABS.map(([v, l]) => (
          <label key={v} className="cursor-pointer">
            <input type="radio" name="type" value={v} checked={kind === v} onChange={() => setKind(v)} className="peer sr-only" />
            <span className="block rounded-xl py-2.5 text-center text-sm font-semibold text-muted transition peer-checked:bg-primary peer-checked:text-white peer-focus-visible:ring-4 peer-focus-visible:ring-primary/20">{l}</span>
          </label>
        ))}
      </div>

      <div className="text-center">
        <label htmlFor="amount" className="text-sm text-muted">Monto</label>
        <div className="mt-1 flex items-start justify-center gap-1">
          <span className="mt-2 whitespace-nowrap text-2xl font-bold text-muted" aria-hidden="true">{currencySymbol(cur)}</span>
          <input id="amount" name="amount" required inputMode="decimal" autoComplete="off" placeholder="0" aria-label={`Monto en ${currencyName(cur)}`}
            value={amount} onChange={(e) => setAmount(e.target.value)}
            className="w-full max-w-[16rem] bg-transparent text-center text-5xl font-extrabold tracking-tight text-text placeholder:text-line focus:outline-none" />
        </div>
        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-muted shadow-soft">
          <Icon name="calendar" className="h-3.5 w-3.5" />
          <input name="date" type="date" required defaultValue={today} aria-label="Fecha" className="bg-transparent text-text focus:outline-none" />
          <span>· {me}</span>
        </label>
      </div>

      {transfer ? (
        <>
          <fieldset>
            <legend className="mb-3 font-bold">Desde (tu cuenta)</legend>
            <div className="grid grid-cols-2 gap-3">
              {mine.map((a) => <Tile key={a.id} name="accountId" value={a.id} label={accLabel(a)} icon="bank" tone="blue" layout="row" checked={from === a.id} onChange={() => setFrom(a.id)} />)}
            </div>
          </fieldset>
          <div>
            <label htmlFor="toAccountId" className="mb-3 block font-bold">Hacia</label>
            <select id="toAccountId" name="toAccountId" required className="input" value={toAcc?.id ?? ""} onChange={(e) => setToSel(e.target.value)}>
              {!hasDest && <option value="">No hay otra cuenta en el hogar</option>}
              {destMine.length > 0 && <optgroup label="Mis cuentas">{destMine.map((a) => <option key={a.id} value={a.id}>{accLabel(a)}</option>)}</optgroup>}
              {others.filter((o) => o.accounts.length).map((o) => <optgroup key={o.owner} label={`De ${o.owner}`}>{o.accounts.map((a) => <option key={a.id} value={a.id}>{accLabel(a)}</option>)}</optgroup>)}
            </select>
          </div>
          {fx && (
            <div className="card space-y-2">
              <label htmlFor="exchangeRate" className="block font-bold">¿A cuánto lo tomás?</label>
              <div className="flex items-center gap-2 text-sm">
                <span className="shrink-0 font-semibold">1 {currencyName(fx.base)} =</span>
                <span className="shrink-0 text-muted">{currencySymbol(fx.quote)}</span>
                <input id="exchangeRate" name="exchangeRate" required inputMode="decimal" autoComplete="off" placeholder="Ej. 1.250,50"
                  value={rate} onChange={(e) => setRate(e.target.value)} className="input min-w-0 flex-1" />
              </div>
              <p className="text-xs text-muted" aria-live="polite">
                {arrives ? <>Llegan <b className="text-text">{arrives}</b> a {toAcc!.name}.</> : `Sale en ${currencyName(fromAcc!.currency)} y llega en ${currencyName(toAcc!.currency)}. El tipo de cambio queda guardado en la transferencia.`}
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          <fieldset>
            <legend className="mb-3 font-bold">Categoría</legend>
            {categories.length === 0 ? (
              <p className="text-sm text-muted">Primero creá una categoría.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                {categories.map((c) => { const v = categoryVisual(c.name, kind); return <Tile key={c.id} name="categoryId" value={c.id} label={c.name} icon={v.icon} tone={v.tone} required />; })}
              </div>
            )}
          </fieldset>
          <fieldset>
            <legend className="mb-3 font-bold">Cuenta</legend>
            <div className="grid grid-cols-2 gap-3">
              {mine.map((a, i) => <Tile key={a.id} name="accountId" value={a.id} label={accLabel(a)} icon="bank" tone="blue" layout="row" checked={from === a.id} onChange={() => setFrom(a.id)} required={i === 0} />)}
            </div>
          </fieldset>
        </>
      )}

      <label className="relative block">
        <Icon name="note" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input name="description" maxLength={120} aria-label="Nota" placeholder={transfer ? "Añadir nota (opcional, por defecto «Transferencia»)" : "Añadir nota (opcional)"} className="input pl-11" />
      </label>

      <SubmitButton className="btn w-full py-4 text-base" pendingText="Guardando..."><Icon name="check" className="h-5 w-5" strokeWidth={2.6} />{transfer ? "Guardar transferencia" : "Guardar"}</SubmitButton>
    </form>
  );
}
