"use client";
// "Eliminar cuenta" con modal de confirmación (el servidor vuelve a validar todo).
import { useRef, useState } from "react";
import SubmitButton from "./SubmitButton";
import { Icon } from "./ui";

type Props = {
  id: string; name: string; balance: string; hasBalance: boolean; txs: number;
  onlyAccountBlock: boolean; deleteBlock: string | null; targets: { id: string; name: string }[];
  action: (fd: FormData) => Promise<void>;
};

export default function DeleteAccount({ id, name, balance, hasBalance, txs, onlyAccountBlock, deleteBlock, targets, action }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"move" | "delete">(targets.length ? "move" : "delete");
  const hasMovements = txs > 0 || !!deleteBlock;
  const cantDelete = mode === "delete" && !!deleteBlock;
  const cantMove = mode === "move" && !targets.length;
  const radio = (on: boolean) => `flex w-full items-start gap-3 rounded-2xl border-2 p-3 text-left text-sm ${on ? "border-primary bg-primary/10" : "border-transparent bg-bg"}`;

  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className="btn-ghost w-full justify-center !text-neg">
        <Icon name="x" className="h-4 w-4" />Eliminar cuenta
      </button>

      <dialog ref={ref} aria-label={`Eliminar ${name}`} className="w-[calc(100%-2rem)] max-w-md rounded-[24px] bg-surface p-0 text-text shadow-fab backdrop:bg-black/50"
        onClick={(e) => { if (e.target === e.currentTarget) ref.current?.close(); }}>
        <form action={action} className="space-y-4 p-5">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="mode" value={hasMovements ? mode : "direct"} />
          <div>
            <h2 className="text-lg font-extrabold">¿Eliminar {name}?</h2>
            <p className="mt-1 text-sm text-muted">Esta acción no se puede deshacer.</p>
          </div>

          {onlyAccountBlock ? (
            <p role="alert" className="rounded-2xl bg-neg/10 px-4 py-3 text-sm font-medium text-neg">Creá otra cuenta antes de eliminar esta.</p>
          ) : hasMovements && (
            <div className="space-y-2">
              <p className="text-sm">{hasBalance ? <>Esta cuenta tiene <b className="tabular-nums">{balance}</b>. ¿Qué querés hacer con el saldo y los movimientos?</> : <>Esta cuenta tiene {txs} {txs === 1 ? "movimiento" : "movimientos"}. ¿Qué querés hacer con ellos?</>}</p>
              <button type="button" role="radio" aria-checked={mode === "move"} onClick={() => setMode("move")} className={radio(mode === "move")}>
                <Icon name="transfer" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span><b className="block">Mover movimientos a otra cuenta</b><span className="text-xs text-muted">Pasan los movimientos, el ahorro, las suscripciones y el saldo. El total no cambia.</span></span>
              </button>
              {mode === "move" && (targets.length ? (
                <select name="targetId" aria-label="Cuenta destino" className="input">
                  {targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              ) : <p className="px-1 text-xs text-muted">No tenés otra cuenta en la misma moneda.</p>)}
              <button type="button" role="radio" aria-checked={mode === "delete"} onClick={() => setMode("delete")} className={radio(mode === "delete")}>
                <Icon name="x" className="mt-0.5 h-4 w-4 shrink-0 text-neg" />
                <span><b className="block">Eliminar cuenta y sus movimientos</b><span className="text-xs text-muted">Las transferencias con otras cuentas también se borran y cambian el saldo de esas cuentas.</span></span>
              </button>
              {cantDelete && <p role="alert" className="px-1 text-xs font-medium text-neg">{deleteBlock}</p>}
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={() => ref.current?.close()} className="btn-ghost flex-1 justify-center">Cancelar</button>
            {!onlyAccountBlock && <SubmitButton className="btn flex-1 !bg-neg hover:!bg-neg/90" pendingText="Eliminando..." disabled={cantDelete || cantMove}>Eliminar</SubmitButton>}
          </div>
        </form>
      </dialog>
    </>
  );
}
