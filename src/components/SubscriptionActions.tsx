"use client";
import { useRef, useState } from "react";
import { money } from "@/lib/currency";
import { toCents } from "@/lib/util";
import SubmitButton from "./SubmitButton";
import { Icon } from "./ui";
import Amt from "./Amt";

type Acc = { id: string; name: string; currency: string };
type Props = {
  sub: { id: string; name: string; amount: string; currency: string; accountId: string; owner: string };
  accounts: Acc[]; // cuentas propias del dueño
  chargedToday: "no" | "cobrado" | "anulado";
  back: string;
  changeAction: (fd: FormData) => void;
  chargeAction: (fd: FormData) => void;
};

/** Cierra con fade (clase .closing en globals.css) y después llama a close(). */
function closeAnimated(d: HTMLDialogElement | null) {
  if (!d || !d.open || d.classList.contains("closing")) return;
  d.classList.add("closing");
  setTimeout(() => { d.classList.remove("closing"); d.close(); }, 150);
}

const parse = (v: string) => { try { const c = toCents(v); return c > 0n ? c : null; } catch { return null; } };

/** Botones "Modificar monto" y "Cobrar ahora" de una suscripción, cada uno con su ventana (nada se cobra solo). */
export default function SubscriptionActions({ sub, accounts, chargedToday, back, changeAction, chargeAction }: Props) {
  const editRef = useRef<HTMLDialogElement>(null);
  const chargeRef = useRef<HTMLDialogElement>(null);
  const [amount, setAmount] = useState(sub.amount);
  const [accountId, setAccountId] = useState(sub.accountId);
  const sameCurrency = accounts.filter((a) => a.currency === sub.currency);
  const acc = accounts.find((a) => a.id === accountId);
  const cents = parse(amount);
  const open = (r: React.RefObject<HTMLDialogElement>) => { setAmount(sub.amount); setAccountId(sub.accountId); r.current?.showModal(); };
  const done = chargedToday !== "no";

  const dialog = "w-[calc(100%-2rem)] max-w-md rounded-[24px] bg-surface p-0 text-text shadow-fab backdrop:bg-black/40";
  const header = (title: string, r: React.RefObject<HTMLDialogElement>) => (
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-bold">{title}</h3>
      <button type="button" onClick={() => closeAnimated(r.current)} aria-label="Cerrar" className="rounded-full p-1.5 text-muted hover:bg-bg"><Icon name="x" className="h-5 w-5" /></button>
    </div>
  );
  const amountField = (label: string) => (
    <label className="block text-xs text-muted">{label}
      <input name="amount" required inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} className="input mt-1 text-lg font-bold" />
    </label>
  );

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => open(editRef)} className="pill justify-center"><Icon name="pencil" className="h-4 w-4" />Modificar monto</button>
        <button type="button" onClick={() => open(chargeRef)} disabled={done}
          className="btn !py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60">
          <Icon name="check" className="h-4 w-4" />{chargedToday === "cobrado" ? "Cobrado hoy" : chargedToday === "anulado" ? "Anulado hoy" : "Cobrar ahora"}
        </button>
      </div>

      <dialog ref={editRef} onCancel={(e) => { e.preventDefault(); closeAnimated(editRef.current); }} className={dialog} aria-label={`Modificar monto de ${sub.name}`}>
        <form action={changeAction} className="space-y-4 p-5">
          {header(`Modificar ${sub.name}`, editRef)}
          <input type="hidden" name="id" value={sub.id} />
          <input type="hidden" name="back" value={back} />
          {amountField("Monto a cobrar")}
          <label className="block text-xs text-muted">Cuenta de donde se cobra (opcional)
            <select name="accountId" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="input mt-1">
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.currency === sub.currency ? a.name : `${a.name} · ${a.currency}`}</option>)}
            </select>
          </label>
          <label className="block text-xs text-muted">Nota (opcional)
            <input name="note" maxLength={120} placeholder="Ej. aumentó el precio" className="input mt-1" />
          </label>
          <p className="text-xs text-muted">No se crea ningún movimiento: solo cambia el monto para el próximo cobro y queda en el historial.</p>
          <SubmitButton className="btn w-full" pendingText="Guardando..." disabled={!cents}>Guardar monto</SubmitButton>
        </form>
      </dialog>

      <dialog ref={chargeRef} onCancel={(e) => { e.preventDefault(); closeAnimated(chargeRef.current); }} className={dialog} aria-label={`Cobrar ${sub.name}`}>
        <form action={chargeAction} className="space-y-4 p-5">
          {header(`Cobrar ${sub.name}`, chargeRef)}
          <input type="hidden" name="id" value={sub.id} />
          <input type="hidden" name="back" value={back} />
          {amountField("Monto de este cobro (editalo si cambió)")}
          <label className="block text-xs text-muted">Desde la cuenta
            <select name="accountId" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="input mt-1">
              {sameCurrency.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <p className="rounded-2xl bg-bg px-4 py-3 text-sm">
            {cents && acc
              ? <>Vas a cobrar <b>{sub.name}</b> · <b><Amt c={sub.currency}>{money(cents, sub.currency)}</Amt></b> desde <b>{acc.name}</b> de {sub.owner}. ¿Confirmás?</>
              : "Poné un monto válido para cobrar."}
          </p>
          <p className="text-xs text-muted">Se registra como gasto de hoy en Suscripciones y el próximo cobro sugerido pasa al siguiente ciclo.</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => closeAnimated(chargeRef.current)} className="pill justify-center">Cancelar</button>
            <SubmitButton className="btn" pendingText="Cobrando..." disabled={!cents || !acc}>Confirmar cobro</SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
