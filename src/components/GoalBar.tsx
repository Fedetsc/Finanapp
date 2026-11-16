// Barra de progreso de un objetivo de gastos. Sin "use client": sirve en server y client.
import type { GoalLevel } from "@/lib/goal-math";

/** `light`: sobre la tarjeta azul. El color avisa: verde normal, amarillo desde el 90%, rojo al 100%. */
export default function GoalBar({ pct, level, tone = "default", size = "md", label }: { pct: number; level: GoalLevel; tone?: "default" | "light"; size?: "sm" | "md"; label: string }) {
  const fill = level === "over" ? "bg-neg" : level === "warn" ? "bg-warn" : tone === "light" ? "bg-mint" : "bg-pos";
  const track = tone === "light" ? "bg-white/15" : "bg-bg";
  return (
    <div className={`${size === "sm" ? "h-1.5" : "h-2.5"} overflow-hidden rounded-full ${track}`} role="progressbar" aria-valuenow={Math.min(pct, 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={`h-full rounded-full transition-[width] duration-500 ${fill}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}
