"use client";
import { useEffect, useState } from "react";
import { Icon } from "./ui";

// Evento de Chrome/Android para instalar la PWA (no está en los tipos de TypeScript).
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const KEY = "finanapp_install_dismissed"; // "Ahora no": no se vuelve a mostrar por 14 días en este dispositivo
const SNOOZE = 14 * 24 * 60 * 60 * 1000;

const installed = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const mobile = () => window.matchMedia("(max-width: 767px) and (pointer: coarse)").matches;
const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);
const snoozed = () => { try { return Date.now() - Number(localStorage.getItem(KEY) ?? 0) < SNOOZE; } catch { return false; } };

/** Aviso "Instalar app": solo en el celular y solo si todavía no está instalada. */
export default function InstallPrompt() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (installed() || !mobile() || snoozed()) return;
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as InstallEvent); };
    const onInstalled = () => { setEvt(null); setIosHint(false); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // Safari en iPhone no tiene beforeinstallprompt: se explica cómo agregarla a mano.
    if (ios()) setIosHint(true);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (!evt && !iosHint) return null;
  const dismiss = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch { /* sin storage: solo se oculta ahora */ } setEvt(null); setIosHint(false); };
  const install = async () => { if (!evt) return; await evt.prompt(); await evt.userChoice; setEvt(null); };

  return (
    <div role="dialog" aria-label="Instalar app" className="fixed inset-x-3 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-40 flex items-center gap-3 rounded-[20px] bg-surface p-3 shadow-fab [animation:rise_250ms_ease-out_both] md:hidden">
      <img src="/icons/icon-192.png" alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">Instalá Finanzas Hogar</p>
        <p className="text-xs text-muted">{evt ? "Abrila como app, sin la barra del navegador." : <>Tocá Compartir <Icon name="up" className="inline h-3.5 w-3.5" /> y después «Agregar a inicio».</>}</p>
      </div>
      {evt && <button type="button" onClick={install} className="btn shrink-0 !px-4 !py-2">Instalar</button>}
      <button type="button" onClick={dismiss} aria-label="Ahora no" className="shrink-0 rounded-full p-1.5 text-muted hover:bg-bg"><Icon name="x" className="h-4 w-4" /></button>
    </div>
  );
}
