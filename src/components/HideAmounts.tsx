"use client";
import { useSyncExternalStore } from "react";
import { Icon } from "./ui";

// Estado por dispositivo: localStorage + atributo en <html> (lo lee el CSS y el script de layout.tsx al cargar).
const KEY = "finanapp_hide_amounts";
const ATTR = "data-hide-amounts";
const EVENT = "finanapp:hide-amounts";

const read = () => document.documentElement.hasAttribute(ATTR);
function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  // Otra pestaña cambió el estado.
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { apply(e.newValue === "1", false); cb(); } };
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", onStorage); };
}
function apply(hidden: boolean, persist = true) {
  document.documentElement.toggleAttribute(ATTR, hidden);
  if (persist) { try { localStorage.setItem(KEY, hidden ? "1" : "0"); } catch { /* modo privado: solo dura esta sesión */ } }
  window.dispatchEvent(new Event(EVENT));
}

/** true si los montos están ocultos (para lo que no se puede ocultar con CSS, como los tooltips de los gráficos). */
export function useAmountsHidden() {
  return useSyncExternalStore(subscribe, read, () => false);
}

/** Botón ojito. `tone="light"` para usarlo sobre la tarjeta azul. */
export default function HideAmountsToggle({ tone = "default", className = "" }: { tone?: "default" | "light"; className?: string }) {
  const hidden = useAmountsHidden();
  const colors = tone === "light" ? "bg-white/10 text-white/80 hover:bg-white/20 hover:text-white" : "bg-surface text-muted shadow-soft hover:text-text";
  return (
    <button type="button" onClick={() => apply(!hidden)} aria-pressed={hidden} aria-label={hidden ? "Mostrar montos" : "Ocultar montos"} title={hidden ? "Mostrar montos" : "Ocultar montos"}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-mint ${colors} ${className}`}>
      <Icon name={hidden ? "eyeOff" : "eye"} className="h-[18px] w-[18px]" />
    </button>
  );
}
