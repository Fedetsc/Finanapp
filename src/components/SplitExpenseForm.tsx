"use client";
import { useState } from "react";
import Link from "next/link";
import { money } from "@/lib/currency";
import { toCents } from "@/lib/util";
import { splitEqual } from "@/lib/goal-math";
import SubmitButton from "./SubmitButton";

type Person = { id: string; name: string };
type Mode = "equal" | "percent" | "amount";
export type ExpenseInitial = { id: string; description: string; amount: string; paidBy: string; date: string; mode: Mode; included: string[]; input: Record<string, string> };
const cents = (v: string) => { try { const c = toCents(v); return c >= 0n ? c : null; } catch { return null; } };

/** Alta / edición de un gasto de la división. Por defecto: en partes iguales entre todos, pagó "yo", fecha de hoy. */
export default function SplitExpenseForm({ groupId, people, currency, today, me, initial, cancelHref, action }: {
  groupId: string; people: Person[]; currency: string; today: string; me: string | null; initial?: ExpenseInitial; cancelHref?: string; action: (fd: FormData) => void;
}) {
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [mode, setMode] = useState<Mode>(initial?.mode ?? "equal");
  const [included, setIncluded] = useState<string[]>(initial?.included ?? people.map((p) => p.id));
  const [vals, setVals] = useState<Record<string, string>>(initial?.input ?? {});
  const total = cents(amount);
  const fmtC = (c: bigint) => money(c, currency);
  const inc = people.filter((p) => included.includes(p.id));
  const eq = total ? splitEqual(total, inc.length) : [];
  const pctSum = people.reduce((a, p) => a + (Number(vals[p.id]) || 0), 0);
  const amtSum = people.reduce((a, p) => a + (cents(vals[p.id] ?? "") ?? 0n), 0n);
  const ok = !!total && total > 0n && (mode === "equal" ? inc.length > 0 : mode === "percent" ? pctSum === 100 : amtSum === total);
  const tab = (on: boolean) => `rounded-xl py-2 text-center text-xs font-semibold transition ${on ? "bg-primary text-white" : "text-muted hover:text-text"}`;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="groupId" value={groupId} />
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="split" value={mode} />
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
        <label className="block"><span className="label">Descripción</span>
          <input name="description" required maxLength={80} autoComplete="off" placeholder="Ej. Asado" defaultValue={initial?.description} className="input" />
        </label>
        <label className="block"><span className="label">Monto</span>
          <input name="amount" required inputMode="decimal" autoComplete="off" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="input font-bold" />
        </label>
      </div>
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
        <label className="block"><span className="label">Quién pagó</span>
          <select name="paidBy" defaultValue={initial?.paidBy ?? me ?? people[0]?.id} className="input">
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="block"><span className="label">Fecha</span>
          <input name="date" type="date" required defaultValue={initial?.date ?? today} className="input" />
        </label>
      </div>

      <fieldset>
        <legend className="label">Cómo se divide</legend>
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-bg p-1" role="tablist" aria-label="Cómo se divide">
          <button type="button" role="tab" aria-selected={mode === "equal"} onClick={() => setMode("equal")} className={tab(mode === "equal")}>En partes iguales</button>
          <button type="button" role="tab" aria-selected={mode === "percent"} onClick={() => setMode("percent")} className={tab(mode === "percent")}>Personalizado %</button>
          <button type="button" role="tab" aria-selected={mode === "amount"} onClick={() => setMode("amount")} className={tab(mode === "amount")}>Personalizado $</button>
        </div>
        <ul className="mt-2 space-y-1.5 rounded-2xl bg-bg p-3">
          {people.map((p) => {
            const i = inc.findIndex((x) => x.id === p.id);
            return (
              <li key={p.id} className="flex min-h-[2.25rem] items-center gap-3 text-sm">
                {mode === "equal" ? (
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                    <input type="checkbox" name={`in_${p.id}`} checked={i >= 0} onChange={(e) => setIncluded(e.target.checked ? [...included, p.id] : included.filter((x) => x !== p.id))} className="h-4 w-4 accent-[rgb(var(--primary))]" />
                    <span className="truncate font-semibold">{p.name}</span>
                  </label>
                ) : <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>}
                {mode === "equal" && <span className="text-right font-bold tabular-nums">{i >= 0 && eq[i] !== undefined ? fmtC(eq[i]) : "—"}</span>}
                {mode === "percent" && (
                  <label className="flex items-center gap-1">
                    <input name={`pct_${p.id}`} inputMode="numeric" placeholder="0" value={vals[p.id] ?? ""} onChange={(e) => setVals({ ...vals, [p.id]: e.target.value.replace(/\D/g, "").slice(0, 3) })}
                      aria-label={`Porcentaje de ${p.name}`} className="input !w-16 !px-2 !py-1.5 text-right" />%
                  </label>
                )}
                {mode === "amount" && (
                  <input name={`amt_${p.id}`} inputMode="decimal" autoComplete="off" placeholder="0" value={vals[p.id] ?? ""} onChange={(e) => setVals({ ...vals, [p.id]: e.target.value })}
                    aria-label={`Monto de ${p.name}`} className="input !w-32 !px-3 !py-1.5 text-right" />
                )}
              </li>
            );
          })}
          {mode === "percent" && <li className={`text-xs ${pctSum === 100 ? "text-muted" : "text-neg"}`}>Suman {pctSum}%{pctSum !== 100 && " (tienen que sumar 100%)"}.</li>}
          {mode === "amount" && <li className={`text-xs ${total && amtSum === total ? "text-muted" : "text-neg"}`}>Suman {fmtC(amtSum)}{total ? ` de ${fmtC(total)}` : ""}{total && amtSum !== total ? " (tienen que sumar el total)" : ""}.</li>}
        </ul>
      </fieldset>

      <div className="flex gap-2">
        {cancelHref && <Link href={cancelHref} className="btn-ghost flex-1 justify-center">Cancelar</Link>}
        <SubmitButton className="btn flex-1" pendingText="Guardando..." disabled={!ok}>{initial ? "Guardar cambios" : "Agregar gasto"}</SubmitButton>
      </div>
    </form>
  );
}
