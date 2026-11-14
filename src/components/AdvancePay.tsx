"use client";
import { useState } from "react";
import { fmt } from "@/lib/util";
import SubmitButton from "./SubmitButton";

type Item = { id: string; label: string; detail: string; cents: string };

/** Adelantar pago: elegir cuotas (o todas), ver el total y confirmar con una cuenta propia. */
export default function AdvancePay({ action, cardId, items, accounts }: {
  action: (fd: FormData) => void;
  cardId: string;
  items: Item[];
  accounts: { id: string; name: string }[];
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const total = items.filter((i) => sel.has(i.id)).reduce((t, i) => t + BigInt(i.cents), 0n);
  const allOn = sel.size === items.length;
  const flip = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="cardId" value={cardId} />
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(items.map((i) => i.id)))} className="h-4 w-4 accent-[rgb(var(--primary))]" />
        Pagar todo lo pendiente
      </label>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {items.map((i) => (
          <li key={i.id}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
              <input type="checkbox" name="ids" value={i.id} checked={sel.has(i.id)} onChange={() => flip(i.id)} className="h-4 w-4 accent-[rgb(var(--primary))]" />
              <span className="min-w-0 flex-1"><span className="block truncate">{i.label}</span><span className="text-xs text-muted">{i.detail}</span></span>
              <span className="shrink-0 font-medium">{fmt(BigInt(i.cents))}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs text-muted">¿Con qué cuenta pagás?
          <select name="accountId" required className="input mt-1">{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        </label>
        <div className="flex flex-col justify-end">
          <p className="text-xs text-muted">Total a adelantar</p>
          <p className="text-xl font-semibold">{fmt(total)}</p>
        </div>
      </div>
      <SubmitButton className="btn w-full" disabled={sel.size === 0} pendingText="Registrando pago...">
        {sel.size === 0 ? "Elegí las cuotas a adelantar" : `Confirmar pago de ${sel.size} cuota(s) por ${fmt(total)}`}
      </SubmitButton>
    </form>
  );
}
