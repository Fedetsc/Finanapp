"use client";
import { useState } from "react";
import { currencyName, money } from "@/lib/currency";
import { toCents } from "@/lib/util";
import { splitEqual, splitPercent } from "@/lib/goal-math";
import SubmitButton from "./SubmitButton";

type Member = { id: string; name: string; pct: number; me: boolean };
type Props = {
  year: number;
  month: number;
  members: Member[]; // pct: % sugerido según ingresos de los últimos 3 meses
  currencies: string[];
  household: { amount: string; currency: string } | null; // meta del hogar existente (para editar)
  memberGoals: Record<string, string>; // memberId -> monto existente
  saveHousehold: (fd: FormData) => void;
  saveMember: (fd: FormData) => void;
};
type Split = "none" | "equal" | "income" | "custom";
const SPLITS: [Split, string][] = [["equal", "En partes iguales"], ["income", "Por % de ingresos"], ["custom", "Montos específicos"], ["none", "Sin dividir"]];
const cents = (v: string) => { try { const c = toCents(v); return c > 0n ? c : null; } catch { return null; } };

/** Formulario para crear o editar el objetivo de gastos del mes (del hogar completo o de un miembro). */
export default function GoalForm({ year, month, members, currencies, household, memberGoals, saveHousehold, saveMember }: Props) {
  const [kind, setKind] = useState<"household" | "member">("household");
  const [amount, setAmount] = useState(household?.amount ?? "");
  const [currency, setCurrency] = useState(household?.currency ?? "ARS");
  const [split, setSplit] = useState<Split>(members.length > 1 ? "equal" : "none");
  const [pcts, setPcts] = useState<Record<string, string>>(Object.fromEntries(members.map((x) => [x.id, String(x.pct)])));
  const [amts, setAmts] = useState<Record<string, string>>(Object.fromEntries(members.map((x) => [x.id, memberGoals[x.id] ?? ""])));
  const [who, setWho] = useState(members.find((x) => x.me)?.id ?? members[0]?.id ?? "");
  const [memberAmount, setMemberAmount] = useState(memberGoals[who] ?? "");

  const total = cents(amount);
  const fmtC = (c: bigint) => money(c, currency);
  const pctSum = members.reduce((a, x) => a + (Number(pcts[x.id]) || 0), 0);
  let preview: bigint[] | null = null;
  try {
    if (total && split === "equal") preview = splitEqual(total, members.length);
    if (total && split === "income") preview = splitPercent(total, members.map((x) => Number(pcts[x.id])));
  } catch { preview = null; }
  const customSum = members.reduce((a, x) => a + (cents(amts[x.id] ?? "") ?? 0n), 0n);
  const okHousehold = !!total && (split !== "income" || pctSum === 100) && (split !== "custom" || customSum === total);
  const tab = (on: boolean) => `rounded-xl py-2 text-center text-sm font-semibold transition ${on ? "bg-primary text-white" : "text-muted hover:text-text"}`;
  const hidden = <><input type="hidden" name="year" value={year} /><input type="hidden" name="month" value={month} /></>;
  const currencySelect = currencies.length > 1 && (
    <select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="Moneda" className="input !w-auto !px-3">
      {currencies.map((c) => <option key={c} value={c}>{currencyName(c)}</option>)}
    </select>
  );

  return (
    <div className="card space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-bg p-1" role="tablist" aria-label="Tipo de objetivo">
        <button type="button" role="tab" aria-selected={kind === "household"} onClick={() => setKind("household")} className={tab(kind === "household")}>Hogar completo</button>
        <button type="button" role="tab" aria-selected={kind === "member"} onClick={() => setKind("member")} className={tab(kind === "member")}>Por miembro</button>
      </div>

      {kind === "household" ? (
        <form action={saveHousehold} className="space-y-4">
          {hidden}
          {currencies.length <= 1 && <input type="hidden" name="currency" value={currency} />}
          <label className="block"><span className="label">Monto total del mes</span>
            <div className="flex gap-2">
              <input name="amount" required inputMode="decimal" autoComplete="off" placeholder="Ej. 500.000" value={amount} onChange={(e) => setAmount(e.target.value)} className="input text-lg font-bold" />
              {currencySelect}
            </div>
          </label>

          {members.length > 1 && (
            <fieldset>
              <legend className="label">Cómo dividirlo entre los miembros</legend>
              <div className="grid grid-cols-2 gap-2">
                {SPLITS.map(([v, l]) => (
                  <label key={v} className="cursor-pointer">
                    <input type="radio" name="split" value={v} checked={split === v} onChange={() => setSplit(v)} className="peer sr-only" />
                    <span className="block rounded-2xl border-2 border-transparent bg-bg px-3 py-2.5 text-center text-xs font-semibold transition peer-checked:border-pos peer-checked:bg-mint-soft peer-focus-visible:ring-4 peer-focus-visible:ring-primary/15">{l}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {members.length <= 1 && <input type="hidden" name="split" value="none" />}

          {members.length > 1 && split !== "none" && (
            <ul className="space-y-2 rounded-2xl bg-bg p-3">
              {members.map((x, i) => (
                <li key={x.id} className="flex items-center gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate font-semibold">{x.name}</span>
                  {split === "income" && (
                    <label className="flex items-center gap-1">
                      <input name={`pct_${x.id}`} inputMode="numeric" value={pcts[x.id]} onChange={(e) => setPcts({ ...pcts, [x.id]: e.target.value.replace(/\D/g, "").slice(0, 3) })}
                        aria-label={`Porcentaje de ${x.name}`} className="input !w-16 !px-2 !py-1.5 text-right" />%
                    </label>
                  )}
                  {split === "custom" ? (
                    <input name={`amt_${x.id}`} inputMode="decimal" autoComplete="off" placeholder="0" value={amts[x.id]} onChange={(e) => setAmts({ ...amts, [x.id]: e.target.value })}
                      aria-label={`Monto de ${x.name}`} className="input !w-36 !px-3 !py-1.5 text-right" />
                  ) : (
                    <span className="w-32 text-right font-bold tabular-nums">{preview ? fmtC(preview[i]) : "—"}</span>
                  )}
                </li>
              ))}
              {split === "income" && <li className={`text-xs ${pctSum === 100 ? "text-muted" : "text-neg"}`}>Suman {pctSum}%{pctSum !== 100 && " (tienen que sumar 100%)"}. Sugerido según los ingresos de los últimos 3 meses.</li>}
              {split === "custom" && <li className={`text-xs ${total && customSum === total ? "text-muted" : "text-neg"}`}>Suman {fmtC(customSum)}{total ? ` de ${fmtC(total)}` : ""}{total && customSum !== total ? " (tienen que sumar el total)" : ""}.</li>}
            </ul>
          )}
          <SubmitButton className="btn w-full" pendingText="Guardando..." disabled={!okHousehold}>{household ? "Guardar cambios" : "Guardar objetivo"}</SubmitButton>
        </form>
      ) : (
        <form action={saveMember} className="space-y-4">
          {hidden}
          {currencies.length <= 1 && <input type="hidden" name="currency" value={currency} />}
          <label className="block"><span className="label">Miembro</span>
            <select name="memberId" value={who} onChange={(e) => { setWho(e.target.value); setMemberAmount(memberGoals[e.target.value] ?? ""); }} className="input">
              {members.map((x) => <option key={x.id} value={x.id}>{x.me ? `${x.name} (yo)` : x.name}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Monto del mes</span>
            <div className="flex gap-2">
              <input name="amount" required inputMode="decimal" autoComplete="off" placeholder="Ej. 200.000" value={memberAmount} onChange={(e) => setMemberAmount(e.target.value)} className="input text-lg font-bold" />
              {currencySelect}
            </div>
          </label>
          <SubmitButton className="btn w-full" pendingText="Guardando..." disabled={!cents(memberAmount)}>{memberGoals[who] ? "Guardar cambios" : "Guardar objetivo"}</SubmitButton>
        </form>
      )}
    </div>
  );
}
