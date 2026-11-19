"use client";
// Inicio: "Pagar suscripciones" abre un menú desde abajo (80% de la pantalla) para pagar sin salir de Inicio.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { QuickPayResult } from "@/lib/subscription-actions";
import { Icon, IconTile } from "./ui";
import Amt from "./Amt";

export type QuickSub = { id: string; name: string; amount: string; currency: string; next: string; due: boolean };
type Props = { subs: QuickSub[]; accounts: { id: string; name: string; currency: string }[]; defaultAccountId: string; action: (fd: FormData) => Promise<QuickPayResult> };

export default function SubsQuickPay({ subs, accounts, defaultAccountId, action }: Props) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [accountId, setAccountId] = useState(defaultAccountId);
  const [paying, setPaying] = useState<string | null>(null);
  const [justPaid, setJustPaid] = useState<string | null>(null);
  const [paid, setPaid] = useState<string[]>([]);
  const [error, setError] = useState<{ id: string; text: string } | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(""), 2600); return () => clearTimeout(id); }, [toast]);

  const due = subs.filter((s) => s.due && !paid.includes(s.id)).length;
  const acc = accounts.find((a) => a.id === accountId);

  function close() {
    const d = ref.current;
    if (!d || !d.open || d.classList.contains("closing")) return;
    d.classList.add("closing");
    setTimeout(() => { d.classList.remove("closing"); d.close(); }, 200);
  }

  async function pay(id: string) {
    setError(null); setPaying(id);
    const fd = new FormData(); fd.set("id", id); fd.set("accountId", accountId);
    const r = await action(fd);
    setPaying(null);
    if (!r.ok) { setError({ id, text: r.error }); return; }
    setJustPaid(id);
    setToast(`Pagado ${r.name} ${r.amount}`);
    router.refresh(); // actualiza la tarjeta de Inicio (saldo) sin recargar la página
    setTimeout(() => { setJustPaid(null); setPaid((p) => [...p, id]); }, 1000);
  }

  return (
    <>
      <button type="button" onClick={() => { setError(null); ref.current?.showModal(); }} aria-haspopup="dialog"
        className="card flex w-full shrink-0 items-center gap-3 !py-1.5 text-left transition active:scale-[.98]">
        <IconTile icon="repeat" tone={due ? "blue" : "green"} size="sm" />
        <span className="min-w-0 flex-1">
          {due
            ? <span className="flex items-center gap-1.5 text-[15px] font-bold"><span className="truncate">Pagar suscripciones</span><span className="shrink-0 whitespace-nowrap rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{due} por pagar</span></span>
            : <span className="font-bold text-pos">Suscripciones al día</span>}
        </span>
        <Icon name="chevronRight" className="hidden h-4 w-4 shrink-0 text-muted min-[400px]:block" />
      </button>

      <dialog ref={ref} aria-label="Pagar suscripciones" className="sheet bg-transparent text-text backdrop:bg-black/50"
        onCancel={(e) => { e.preventDefault(); close(); }}
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
        <div className="relative flex h-[80dvh] flex-col rounded-t-[28px] bg-surface px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-fab">
          <span aria-hidden="true" className="mx-auto block h-1.5 w-10 shrink-0 rounded-full bg-line" />
          <div className="mt-3 flex shrink-0 items-center justify-between">
            <h2 className="text-lg font-extrabold">Pagar suscripciones</h2>
            <button type="button" onClick={close} aria-label="Cerrar" className="rounded-full p-1.5 text-muted hover:bg-bg"><Icon name="x" className="h-5 w-5" /></button>
          </div>

          {subs.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-muted">No tenés suscripciones activas</p>
              <Link href="/suscripciones" className="btn">Crear suscripción</Link>
            </div>
          ) : (
            <>
              <label className="mt-2 flex shrink-0 items-center gap-2 text-xs text-muted">
                Pagar con:
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Cuenta para pagar"
                  className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-2.5 py-1.5 text-sm font-semibold text-text">
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
              {due === 0 && <p className="mt-3 shrink-0 rounded-2xl bg-mint-soft px-3 py-2 text-center text-sm font-semibold text-pos">Ya pagaste todas 🎉</p>}

              <ul className="mt-3 min-h-0 flex-1 divide-y divide-line overflow-y-auto overscroll-contain">
                {subs.map((s) => {
                  const done = paid.includes(s.id), flash = justPaid === s.id;
                  const other = acc && acc.currency !== s.currency;
                  return (
                    <li key={s.id} className="flex items-center gap-3 py-3">
                      <IconTile icon="repeat" tone={s.due && !done ? "blue" : "gray"} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate font-semibold ${done ? "text-muted line-through" : ""}`}>{s.name}</span>
                        <span className="block text-xs text-muted"><b className="tabular-nums text-text"><Amt c={s.currency}>{s.amount}</Amt></b> · Próximo: {s.next}</span>
                        {error?.id === s.id && <span role="alert" className="block text-xs font-medium text-neg">{error.text}</span>}
                        {other && !done && !flash && <span className="block text-[11px] text-muted">Elegí una cuenta en {s.currency.replace(/_/g, " ")}</span>}
                      </span>
                      {flash || done ? (
                        <span className="shrink-0 rounded-full bg-mint-soft px-3 py-1.5 text-sm font-bold text-pos">Pagado ✓</span>
                      ) : (
                        <button type="button" onClick={() => pay(s.id)} disabled={!!paying || !!other || !acc}
                          className="btn shrink-0 !bg-pos !px-4 !py-2 text-sm hover:!bg-pos/90 disabled:opacity-50">
                          {paying === s.id ? "..." : "Pagar"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {/* El toast va dentro del menú: el <dialog> abierto tapa todo lo que está afuera. */}
          {toast && (
            <p role="status" className="absolute inset-x-0 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-10 mx-auto flex w-max max-w-[calc(100%-2rem)] items-center gap-2 rounded-full bg-text px-4 py-2.5 text-sm font-semibold text-bg shadow-fab [animation:rise_200ms_ease-out_both]">
              <Icon name="check" className="h-4 w-4 text-mint" />{toast}
            </p>
          )}
        </div>
      </dialog>

    </>
  );
}
