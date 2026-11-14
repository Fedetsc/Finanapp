"use client";
import { useState } from "react";
import { Icon } from "./ui";

/** Botón "Copiar" del código de invitación. */
export default function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn shrink-0 px-4 py-2.5"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); } catch { /* sin permiso de portapapeles */ }
      }}>
      <Icon name={done ? "check" : "copy"} className="h-4 w-4" />{done ? "Copiado" : label}
    </button>
  );
}
