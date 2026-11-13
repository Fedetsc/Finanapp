"use client";
import { useState } from "react";

type Opt = { id: string; name: string };
type Kind = "EXPENSE" | "INCOME" | "TRANSFER";

const tab = "block cursor-pointer rounded-lg border border-line py-2.5 text-center text-sm peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-primary";
const TABS: [Kind, string, string][] = [
  ["EXPENSE", "Gasto", "peer-checked:border-neg peer-checked:text-neg"],
  ["INCOME", "Ingreso", "peer-checked:border-pos peer-checked:text-pos"],
  ["TRANSFER", "Transferencia", "peer-checked:border-primary peer-checked:text-primary"],
];

/**
 * mine: cuentas propias (únicas válidas como cuenta del gasto/ingreso u origen).
 * others: cuentas de otros miembros, agrupadas por dueño (solo como destino de transferencia).
 */
export default function MovementForm({ action, mine, others, categories, today }: {
  action: (fd: FormData) => void;
  mine: Opt[];
  others: { owner: string; accounts: Opt[] }[];
  categories: Opt[];
  today: string;
}) {
  const [kind, setKind] = useState<Kind>("EXPENSE");
  const [from, setFrom] = useState(mine[0]?.id ?? "");
  const transfer = kind === "TRANSFER";
  const destMine = mine.filter((a) => a.id !== from);
  const hasDest = destMine.length > 0 || others.some((o) => o.accounts.length > 0);
  const opt = (x: Opt) => <option key={x.id} value={x.id}>{x.name}</option>;

  return (
    <form id="nuevo" action={action} className="card grid gap-3 md:grid-cols-2">
      <div className="grid grid-cols-3 gap-2 md:col-span-2">
        {TABS.map(([v, l, cls]) => (
          <label key={v}>
            <input type="radio" name="type" value={v} checked={kind === v} onChange={() => setKind(v)} className="peer sr-only" />
            <span className={`${tab} ${cls}`}>{l}</span>
          </label>
        ))}
      </div>
      <input name="amount" required inputMode="decimal" placeholder="Importe (ej. 12.500,00)" className="input" />
      <input name="date" type="date" required defaultValue={today} className="input" />
      {transfer ? (
        <>
          <label className="text-xs text-muted">Desde (tu cuenta)
            <select name="accountId" required value={from} onChange={(e) => setFrom(e.target.value)} className="input mt-1">{mine.map(opt)}</select>
          </label>
          <label className="text-xs text-muted">Hacia
            <select name="toAccountId" required className="input mt-1" key={from}>
              {!hasDest && <option value="">No hay otra cuenta en el hogar</option>}
              {destMine.length > 0 && <optgroup label="Mis cuentas">{destMine.map(opt)}</optgroup>}
              {others.filter((o) => o.accounts.length).map((o) => <optgroup key={o.owner} label={`De ${o.owner}`}>{o.accounts.map(opt)}</optgroup>)}
            </select>
          </label>
        </>
      ) : (
        <>
          <select name="accountId" required className="input">{mine.map(opt)}</select>
          <select name="categoryId" required className="input">{categories.length ? categories.map(opt) : <option value="">Primero creá una categoría</option>}</select>
        </>
      )}
      <input name="description" maxLength={120} placeholder={transfer ? "Descripción (opcional, por defecto «Transferencia»)" : "Descripción (opcional)"} className="input md:col-span-2" />
      <button className="btn md:col-span-2">{transfer ? "Guardar transferencia" : "Guardar movimiento"}</button>
    </form>
  );
}
