"use client";
import { useSyncExternalStore } from "react";
import { Icon } from "./ui";

// Tema por dispositivo: localStorage "finanapp_theme" ("light" | "dark") + clase "dark" en <html>.
// El script THEME_SCRIPT de src/app/layout.tsx lo aplica antes de pintar (sin parpadeo) y, si no hay
// nada guardado, usa prefers-color-scheme del sistema.
const KEY = "finanapp_theme";
const EVENT = "finanapp:theme";

const read = () => document.documentElement.classList.contains("dark");
function apply(dark: boolean, persist = true) {
  document.documentElement.classList.toggle("dark", dark);
  if (persist) { try { localStorage.setItem(KEY, dark ? "dark" : "light"); } catch { /* modo privado: solo dura esta sesión */ } }
  window.dispatchEvent(new Event(EVENT));
}
function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  // Otra pestaña cambió el tema.
  const onStorage = (e: StorageEvent) => { if (e.key === KEY && e.newValue) { apply(e.newValue === "dark", false); cb(); } };
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", onStorage); };
}

export function useDarkTheme() {
  return useSyncExternalStore(subscribe, read, () => false);
}

/** Botón sol/luna: cambia entre tema claro y oscuro. */
export default function ThemeToggle() {
  const dark = useDarkTheme();
  const label = dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro";
  return (
    <button type="button" onClick={() => apply(!dark)} aria-label={label} title={label}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-text shadow-soft transition duration-150 hover:text-primary active:scale-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
      <Icon key={dark ? "sun" : "moon"} name={dark ? "sun" : "moon"} className="nav-pop h-5 w-5" />
    </button>
  );
}
