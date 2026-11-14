"use client";
import { useState } from "react";
import { CURRENCIES, currencyName } from "@/lib/currency";

/** Selector de moneda de la cuenta (default ARS). "Otro" deja escribir el código (ej. USDT). */
export default function CurrencyPicker({ className = "" }: { className?: string }) {
  const [sel, setSel] = useState("ARS");
  return (
    <div className={`flex gap-2 ${className}`}>
      <select name="currency" required value={sel} onChange={(e) => setSel(e.target.value)} aria-label="Moneda" className="input min-w-0 flex-1">
        {Object.entries(CURRENCIES).map(([code, c]) => <option key={code} value={code}>{currencyName(code)} - {c.label} ({c.symbol})</option>)}
        <option value="OTHER">Otro (billetera o moneda que no está en la lista)</option>
      </select>
      {sel === "OTHER" && (
        <input name="currencyOther" required maxLength={10} pattern="[A-Za-z0-9 _]{2,10}" autoComplete="off" placeholder="Código (ej. USDT)" aria-label="Código de la moneda" className="input w-36 uppercase" />
      )}
    </div>
  );
}
