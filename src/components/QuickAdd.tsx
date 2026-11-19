"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { categoryVisual } from "@/lib/visuals";
import { currencyName, currencySymbol } from "@/lib/currency";
import { toCents } from "@/lib/util";
import type { QuickResult } from "@/lib/quick-actions";
import SubmitButton from "./SubmitButton";
import { Icon, IconTile } from "./ui";

type Kind = "INCOME" | "EXPENSE";
type Opt = { id: string; name: string };
type Acc = Opt & { currency: string };
type Props = {
  income: React.ReactNode; // contenido de la card Ingresos (lo arma Inicio en el servidor)
  expense: React.ReactNode; // contenido de la card Gastos
  accounts: Acc[]; // solo cuentas propias
  lastAccount: Record<Kind, string | null>; // última cuenta usada por tipo
  top: Record<Kind, Opt[]>; // 4-5 categorías más usadas en el último mes
  categories: Opt[];
  action: (fd: FormData) => Promise<QuickResult>;
  compact?: boolean; // cajitas chicas (Inicio sin scroll)
};

const TEXT = {
  EXPENSE: { title: "Añadir gasto", button: "Agregar gasto", done: "Gasto agregado", color: "text-neg", btn: "bg-neg hover:bg-neg/90 focus-visible:outline-neg", ring: "border-neg bg-neg/10" },
  INCOME: { title: "Añadir ingreso", button: "Agregar ingreso", done: "Ingreso agregado", color: "text-pos", btn: "bg-pos hover:bg-pos/90 focus-visible:outline-pos", ring: "border-pos bg-mint-soft" },
} as const;
const valid = (v: string) => { try { return toCents(v) > 0n; } catch { return false; } };

/** Cards Ingresos/Gastos de Inicio: cada una abre un menú desde abajo para cargar el movimiento sin salir de Inicio. */
export default function QuickAdd({ income, expense, accounts, lastAccount, top, categories, action, compact = false }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const [kind, setKind] = useState<Kind>("EXPENSE");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [all, setAll] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const t = TEXT[kind];

  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(""), 2600); return () => clearTimeout(id); }, [toast]);

  function open(k: Kind) {
    setKind(k); setAmount(""); setCategoryId(""); setAll(false); setError("");
    setAccountId(accounts.find((a) => a.id === lastAccount[k])?.id ?? accounts[0]?.id ?? "");
    ref.current?.showModal();
    amountRef.current?.focus(); // dentro del toque: así el celular abre el teclado numérico
  }
  function close() {
    const d = ref.current;
    if (!d || !d.open || d.classList.contains("closing")) return;
    d.classList.add("closing");
    setTimeout(() => { d.classList.remove("closing"); if (panelRef.current) panelRef.current.style.transform = ""; d.close(); }, 200);
  }

  // Deslizar hacia abajo desde la parte de arriba del menú para cerrarlo.
  const onTouchStart = (e: React.TouchEvent) => { drag.current = e.touches[0].clientY; if (panelRef.current) panelRef.current.style.transition = "none"; };
  const onTouchMove = (e: React.TouchEvent) => {
    if (drag.current === null || !panelRef.current) return;
    panelRef.current.style.transform = `translateY(${Math.max(0, e.touches[0].clientY - drag.current)}px)`;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (drag.current === null || !panelRef.current) return;
    const dy = e.changedTouches[0].clientY - drag.current;
    drag.current = null;
    panelRef.current.style.transition = "transform 200ms ease-out";
    if (dy > 90) { panelRef.current.style.transform = "translateY(100%)"; setTimeout(() => { if (ref.current) ref.current.close(); if (panelRef.current) { panelRef.current.style.transition = ""; panelRef.current.style.transform = ""; } }, 200); }
    else panelRef.current.style.transform = "";
  };

  async function submit(fd: FormData) {
    setError("");
    const r = await action(fd);
    if (!r.ok) { setError(r.error); return; }
    close();
    setToast(TEXT[r.type].done);
  }

  const acc = accounts.find((a) => a.id === accountId);
  const shown = all ? categories : top[kind];
  const card = `card w-full text-left ${compact ? "!rounded-2xl !p-2" : ""} transition duration-150 hover:ring-2 hover:ring-line active:scale-[.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`;

  return (
    <>
      <div className={compact ? "grid grid-cols-2 gap-2" : "mt-4 grid grid-cols-2 gap-4"}>
        <button type="button" onClick={() => open("INCOME")} className={card} aria-haspopup="dialog" aria-label="Añadir ingreso">{income}</button>
        <button type="button" onClick={() => open("EXPENSE")} className={card} aria-haspopup="dialog" aria-label="Añadir gasto">{expense}</button>
      </div>

      <dialog ref={ref} aria-label={t.title} className="sheet bg-transparent text-text backdrop:bg-black/50"
        onCancel={(e) => { e.preventDefault(); close(); }}
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
        <div ref={panelRef} className="rounded-t-[28px] bg-surface px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-fab">
          <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} className="touch-none pb-2 pt-3">
            <span aria-hidden="true" className="mx-auto block h-1.5 w-10 rounded-full bg-line" />
            <div className="mt-3 flex items-center justify-between">
              <h2 className={`text-lg font-extrabold ${t.color}`}>{t.title}</h2>
              <button type="button" onClick={close} aria-label="Cerrar" className="rounded-full p-1.5 text-muted hover:bg-bg"><Icon name="x" className="h-5 w-5" /></button>
            </div>
          </div>

          {accounts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Para cargar movimientos, primero <Link href="/cuentas" className="font-semibold text-primary">creá una cuenta tuya</Link>.</p>
          ) : (
            <form action={submit} className="space-y-4">
              <input type="hidden" name="type" value={kind} />
              <input type="hidden" name="accountId" value={accountId} />
              <input type="hidden" name="categoryId" value={categoryId} />

              {/* 1. Monto */}
              <label className="flex items-baseline justify-center gap-2 rounded-2xl bg-bg px-4 py-3">
                <span className="text-2xl font-bold text-muted">{currencySymbol(acc?.currency ?? "ARS")}</span>
                <input ref={amountRef} name="amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="0" aria-label="Monto"
                  style={{ width: `${Math.max(1, amount.length) + 0.6}ch` }}
                  className="min-w-0 max-w-[80%] bg-transparent text-[40px] font-extrabold tracking-tight tabular-nums outline-none placeholder:text-muted/50" />
              </label>

              {/* 2. Cuenta */}
              <div>
                <p className="label">Cuenta</p>
                <div role="radiogroup" aria-label="Cuenta" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
                  {accounts.map((a) => {
                    const on = a.id === accountId;
                    return (
                      <button key={a.id} type="button" role="radio" aria-checked={on} onClick={() => setAccountId(a.id)}
                        className={`shrink-0 rounded-2xl border-2 px-3.5 py-2 text-left text-sm font-semibold transition active:scale-95 ${on ? t.ring : "border-transparent bg-bg"}`}>
                        <span className="block whitespace-nowrap">{a.name}</span>
                        <span className="block text-[11px] font-medium text-muted">{currencyName(a.currency)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Categorías más usadas */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-xs font-medium text-muted">{all ? "Todas las categorías" : "Más usadas"}</p>
                  <button type="button" onClick={() => setAll(!all)} className="text-xs font-semibold text-primary">{all ? "Ver menos" : "Ver todas"}</button>
                </div>
                <div role="radiogroup" aria-label="Categoría" className={all ? "flex max-h-40 flex-wrap gap-2 overflow-y-auto" : "flex flex-wrap gap-2"}>
                  {shown.map((c) => {
                    const on = c.id === categoryId;
                    const v = categoryVisual(c.name, kind);
                    return all ? (
                      <button key={c.id} type="button" role="radio" aria-checked={on} onClick={() => setCategoryId(on ? "" : c.id)}
                        className={`rounded-full border-2 px-3 py-1.5 text-xs font-semibold transition active:scale-95 ${on ? t.ring : "border-transparent bg-bg"}`}>{c.name}</button>
                    ) : (
                      <button key={c.id} type="button" role="radio" aria-checked={on} onClick={() => setCategoryId(on ? "" : c.id)}
                        className={`flex items-center gap-2 rounded-2xl border-2 py-1 pl-1 pr-3 text-sm font-semibold transition active:scale-95 ${on ? t.ring : "border-transparent bg-bg"}`}>
                        <IconTile icon={v.icon} tone={v.tone} size="sm" />
                        <span className="whitespace-nowrap">{c.name}</span>
                      </button>
                    );
                  })}
                </div>
                {!categoryId && <p className="mt-1 text-[11px] text-muted">Si no elegís, va a «{kind === "EXPENSE" ? "Gastos Varios" : "Ingresos Varios"}».</p>}
              </div>

              {/* 4. Descripción */}
              <input name="description" maxLength={120} autoComplete="off" placeholder="Descripción opcional" aria-label="Descripción" className="input !py-2.5" />

              {error && <p role="alert" className="rounded-2xl bg-neg/10 px-4 py-2.5 text-sm font-medium text-neg">{error}</p>}

              {/* 5. Botón (fecha = hoy, miembro = vos) */}
              <SubmitButton className={`btn w-full !py-4 text-base ${t.btn}`} pendingText="Guardando..." disabled={!valid(amount) || !acc}>{t.button}</SubmitButton>
            </form>
          )}
        </div>
      </dialog>

      {toast && (
        <p role="status" className="fixed inset-x-0 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-50 mx-auto flex w-max max-w-[calc(100%-2rem)] items-center gap-2 rounded-full bg-text px-4 py-2.5 text-sm font-semibold text-bg shadow-fab [animation:rise_200ms_ease-out_both] md:bottom-8">
          <Icon name="check" className="h-4 w-4 text-mint" />{toast}
        </p>
      )}
    </>
  );
}
