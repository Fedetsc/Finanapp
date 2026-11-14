"use client";
import { useState } from "react";

/**
 * Campos de rendimientos de una cuenta (alta y edición).
 * Envía: yieldEnabled ("on"), yieldRate (TNA %), yieldManual ("on" = el saldo ya trae los rendimientos, no acreditar).
 */
export default function YieldFields({ enabled = false, rate = "", manual = false, className = "" }: { enabled?: boolean; rate?: string; manual?: boolean; className?: string }) {
  const [on, setOn] = useState(enabled);
  return (
    <div className={`space-y-3 ${className}`}>
      <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
        <input type="checkbox" name="yieldEnabled" checked={on} onChange={(e) => setOn(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--primary))]" />
        Esta cuenta genera rendimientos
      </label>
      {on && (
        <div className="space-y-3 rounded-2xl bg-bg p-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="shrink-0">TNA</span>
            <input name="yieldRate" required inputMode="decimal" autoComplete="off" defaultValue={rate} placeholder="Ej. 35" aria-label="TNA anual en porcentaje" className="input w-28 bg-surface" />
            <span className="shrink-0 text-muted">% anual</span>
          </label>
          <p className="text-xs text-muted">Se acredita todos los días: saldo × TNA ÷ 365. Si la TNA cambia, la podés editar y se usa desde el próximo día.</p>
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input type="checkbox" name="yieldManual" defaultChecked={manual} className="mt-0.5 h-4 w-4 accent-[rgb(var(--primary))]" />
            <span>Mi saldo ya incluye los rendimientos (ej. viene de Mercado Pago): no acreditar automático, solo mostrarlos como informativos.</span>
          </label>
          <p className="text-xs text-muted">No aplica a cuentas de efectivo.</p>
        </div>
      )}
    </div>
  );
}
