"use client";
/// <reference types="react-dom/canary" />
import { useFormStatus } from "react-dom";

/**
 * Botón de envío que se deshabilita mientras la Server Action está en curso.
 * Evita que un doble click cree dos movimientos / compras / hogares. Mismo aspecto que un <button> normal.
 */
export default function SubmitButton({ children, className, pendingText, disabled }: { children: React.ReactNode; className?: string; pendingText?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled} aria-disabled={pending || disabled || undefined}>
      {pending && pendingText ? pendingText : children}
    </button>
  );
}
