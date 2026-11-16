"use client";
import { useEffect, useState } from "react";
import { Icon } from "./ui";

export type GoalAlert = { key: string; level: "warn" | "over"; title: string; text: React.ReactNode };

// Avisos cerrados en este dispositivo. La clave incluye meta + nivel + monto: si se pasa del 90% al 100%,
// o se cambia el monto de la meta, el aviso vuelve a aparecer.
const STORE = "finanapp_goal_alerts_closed";
const readClosed = (): string[] => { try { return JSON.parse(localStorage.getItem(STORE) ?? "[]"); } catch { return []; } };

/** Banners de objetivo (amarillo al 90%, rojo al 100%) arriba de la tarjeta de Inicio. Se pueden cerrar. */
export default function GoalAlerts({ alerts }: { alerts: GoalAlert[] }) {
  const [closed, setClosed] = useState<string[] | null>(null); // null hasta leer localStorage (evita parpadeo)
  useEffect(() => setClosed(readClosed()), []);
  if (!closed) return null;
  const shown = alerts.filter((a) => !closed.includes(a.key));
  if (!shown.length) return null;

  const close = (key: string) => {
    // Se guardan solo las claves de los avisos actuales (no crece para siempre).
    const next = [...closed.filter((k) => alerts.some((a) => a.key === k)), key];
    setClosed(next);
    try { localStorage.setItem(STORE, JSON.stringify(next)); } catch { /* modo privado */ }
  };

  return (
    <div className="mb-4 space-y-2">
      {shown.map((a) => (
        <div key={a.key} role="alert"
          className={`flex items-start gap-3 rounded-2xl px-4 py-3 text-sm [animation:rise_220ms_ease-out_both] ${a.level === "over" ? "bg-[#FDECEE] text-neg dark:bg-neg/15" : "bg-[#FFF4E0] text-[#9A5B00] dark:bg-warn/15 dark:text-[#FCD34D]"}`}>
          <Icon name={a.level === "over" ? "target" : "bolt"} className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="min-w-0 flex-1"><b className="block">{a.title}</b>{a.text}</p>
          <button type="button" onClick={() => close(a.key)} aria-label="Cerrar aviso" className="-mr-1 shrink-0 rounded-full p-1 opacity-70 hover:opacity-100"><Icon name="x" className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}
