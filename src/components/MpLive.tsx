"use client";
// Mercado Pago en Inicio y Cuentas: auto-sync al abrir (si pasaron 2 min), "Actualizado hace X" chiquito
// y el menú desde abajo para categorizar los movimientos nuevos.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ago } from "@/lib/mp-status";
import type { MpLiveProps } from "@/lib/mp-live";
import type { PendingResult } from "@/lib/mp-actions";
import { categoryVisual } from "@/lib/visuals";
import SubmitButton from "./SubmitButton";
import { Icon, IconTile } from "./ui";

type Mode = "category" | "transfer" | "ignore";
const SEEN = "mp-pending-seen";

export default function MpLive({ data, action }: { data: MpLiveProps; action: (fd: FormData) => Promise<PendingResult> }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [syncing, setSyncing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [, tick] = useState(0);
  const [mode, setMode] = useState<Mode>("category");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [error, setError] = useState("");
  const p = data.pendings[0];
  const others = data.accounts.filter((a) => a.id !== p?.accountId && a.currency === p?.currency);

  // Auto-sync: una vez por carga, solo si el servidor dice que está desactualizado.
  const started = useRef(false);
  useEffect(() => {
    if (!data.stale || started.current) return;
    started.current = true;
    setSyncing(true);
    fetch("/api/mp/sync", { method: "POST", cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error(); router.refresh(); })
      .catch(() => setFailed(true))
      .finally(() => setSyncing(false));
  }, [data.stale, router]);

  // Refresca el "hace X min" cada 30 s.
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(id); }, []);

  // Abre el menú solo cuando hay pendientes que no viste en esta sesión (no molesta en cada recarga).
  useEffect(() => {
    if (!p) { if (ref.current?.open) ref.current.close(); return; }
    let seen: string[] = [];
    try { seen = JSON.parse(sessionStorage.getItem(SEEN) ?? "[]"); } catch { /* sin storage */ }
    if (data.pendings.some((x) => !seen.includes(x.id)) && !ref.current?.open) open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id, data.pendings.length]);

  function open() { setError(""); reset(); ref.current?.showModal(); }
  function reset() { setMode("category"); setCategoryId(""); setAccountId(others[0]?.id ?? ""); }
  function close() {
    try { sessionStorage.setItem(SEEN, JSON.stringify(data.pendings.map((x) => x.id))); } catch { /* sin storage */ }
    ref.current?.close();
  }

  async function submit(fd: FormData) {
    setError("");
    const r = await action(fd);
    if (!r.ok) { setError(r.error); return; }
    reset();
    router.refresh();
  }

  const status = syncing ? "Actualizando…" : failed ? "No se pudo actualizar" : data.error ? "Error al sincronizar" : data.lastSyncAt ? `Actualizado ${ago(new Date(data.lastSyncAt))}` : "Sin sincronizar";
  const kind = p?.direction === "IN" ? "INCOME" : "EXPENSE";
  const pill = (on: boolean) => `rounded-full border-2 px-3 py-1.5 text-xs font-semibold transition active:scale-95 ${on ? (p?.direction === "IN" ? "border-pos bg-mint-soft" : "border-neg bg-neg/10") : "border-transparent bg-bg"}`;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted" aria-live="polite">
        <span className="inline-flex items-center gap-1.5">
          {syncing
            ? <span aria-hidden="true" className="h-3 w-3 animate-spin rounded-full border-2 border-muted/40 border-t-primary" />
            : <span aria-hidden="true" className={`h-2 w-2 rounded-full ${failed || data.error ? "bg-warn" : "bg-pos"}`} />}
          Mercado Pago · {status}
        </span>
        {data.needsBase && <Link href={data.needsBase} className="font-semibold text-primary">Cargá el saldo inicial</Link>}
        {data.pendings.length > 0 && (
          <button type="button" onClick={open} className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
            {data.pendings.length} para revisar
          </button>
        )}
      </div>

      <dialog ref={ref} aria-label="Movimiento de Mercado Pago" className="sheet bg-transparent text-text backdrop:bg-black/50"
        onCancel={(e) => { e.preventDefault(); close(); }}
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
        {p && (
          <div className="rounded-t-[28px] bg-surface px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 shadow-fab">
            <span aria-hidden="true" className="mx-auto block h-1.5 w-10 rounded-full bg-line" />
            <div className="mt-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-muted">{p.accountName} · {p.date}{data.pendings.length > 1 ? ` · 1 de ${data.pendings.length}` : ""}</p>
                <h2 className="text-lg font-extrabold">{p.title}</h2>
                {p.detail && <p className="truncate text-xs text-muted">{p.detail}</p>}
              </div>
              <button type="button" onClick={close} aria-label="Cerrar" className="rounded-full p-1.5 text-muted hover:bg-bg"><Icon name="x" className="h-5 w-5" /></button>
            </div>
            <p className={`mt-2 text-[34px] font-extrabold tabular-nums ${p.direction === "IN" ? "text-pos" : "text-neg"}`}>{p.amount}</p>
            <p className="mb-3 text-sm font-semibold">¿Qué fue?</p>

            <form key={p.id} action={submit} className="space-y-3">
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="mode" value={mode} />
              <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-2 gap-2">
                <button type="button" role="radio" aria-checked={mode === "category"} onClick={() => setMode("category")} className={`rounded-2xl border-2 px-3 py-2 text-sm font-semibold ${mode === "category" ? "border-primary bg-primary/10" : "border-transparent bg-bg"}`}>{p.direction === "IN" ? "Ingreso" : "Gasto"}</button>
                <button type="button" role="radio" aria-checked={mode === "transfer"} onClick={() => setMode("transfer")} disabled={!others.length} className={`rounded-2xl border-2 px-3 py-2 text-sm font-semibold disabled:opacity-50 ${mode === "transfer" ? "border-primary bg-primary/10" : "border-transparent bg-bg"}`}>Entre mis cuentas</button>
              </div>

              {mode === "category" && (
                <div>
                  <input type="hidden" name="categoryId" value={categoryId} />
                  <div role="radiogroup" aria-label="Categoría" className="flex max-h-36 flex-wrap gap-2 overflow-y-auto">
                    {data.categories.map((c) => {
                      const v = categoryVisual(c.name, kind);
                      return (
                        <button key={c.id} type="button" role="radio" aria-checked={c.id === categoryId} onClick={() => setCategoryId(c.id === categoryId ? "" : c.id)} className={`${pill(c.id === categoryId)} flex items-center gap-1.5`}>
                          <IconTile icon={v.icon} tone={v.tone} size="sm" />{c.name}
                        </button>
                      );
                    })}
                  </div>
                  {!categoryId && <p className="mt-1 text-[11px] text-muted">Si no elegís, va a «{kind === "INCOME" ? "Ingresos Varios" : "Gastos Varios"}».</p>}
                </div>
              )}

              {mode === "transfer" && (
                <label className="block">
                  <span className="label">{p.direction === "IN" ? "Vino desde" : "Fue hacia"}</span>
                  <select name="accountId" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="input">
                    {others.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </label>
              )}

              {error && <p role="alert" className="rounded-2xl bg-neg/10 px-4 py-2.5 text-sm font-medium text-neg">{error}</p>}
              <SubmitButton className="btn w-full !py-3.5" pendingText="Guardando...">Guardar</SubmitButton>
            </form>
            <form action={submit} className="mt-2">
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="mode" value="ignore" />
              <SubmitButton className="btn-ghost w-full justify-center text-sm" pendingText="...">No registrar</SubmitButton>
            </form>
            <p className="mt-2 text-center text-[11px] text-muted">El saldo de Mercado Pago ya lo incluye: esto solo lo registra en tus movimientos.</p>
          </div>
        )}
      </dialog>
    </>
  );
}
