import { money } from "@/lib/currency";
import { categoryVisual } from "@/lib/visuals";
import { Icon, IconTile } from "./ui";

export type RowTx = {
  id: string;
  type: string;
  amount: bigint;
  toAmount?: bigint | null;
  description: string;
  voidedAt: Date | null;
  category: { name: string } | null;
  account: { name: string; currency: string };
  toAccount: { name: string; currency: string } | null;
  member: { name: string };
};

/**
 * Fila de movimiento estilo ejemplo: ícono en cuadradito de color, título, quién + cuenta, monto a la derecha.
 * `when` (ej. "Hoy") se muestra en la línea de detalle; `chips` cambia el detalle a chips (vista Movimientos).
 */
export default function MovementRow({ t, when, chips = false, action }: { t: RowTx; when?: string; chips?: boolean; action?: React.ReactNode }) {
  const transfer = t.type === "TRANSFER";
  const v = categoryVisual(t.category?.name, t.type);
  const title = transfer ? (t.description && t.description !== "Transferencia" ? t.description : "Transferencia") : t.description || t.category?.name || "Movimiento";
  const account = transfer ? `${t.account.name} → ${t.toAccount?.name ?? "?"}` : t.account.name;
  const voided = !!t.voidedAt;
  const color = voided ? "text-muted line-through" : transfer ? "text-primary" : t.type === "INCOME" ? "text-pos" : "text-neg";
  const sign = transfer ? "" : t.type === "INCOME" ? "+" : "-";
  // Transferencia entre monedas distintas: también se muestra lo que llegó a destino.
  const fx = transfer && t.toAccount && t.toAccount.currency !== t.account.currency && t.toAmount != null;

  return (
    <div className="flex items-center gap-3.5 py-3.5">
      <IconTile icon={v.icon} tone={voided ? "gray" : v.tone} />
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[15px] font-semibold ${voided ? "text-muted line-through" : ""}`}>{title}</p>
        {chips ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {transfer && <span className="chip bg-[#EAF3FB] text-[#1E6FB8]">Transferencia</span>}
            <span className="chip text-text/70">{t.member.name}</span>
            <span className="chip"><Icon name={transfer ? "transfer" : "bank"} className="h-3 w-3" />{account}</span>
            {!transfer && t.category && t.description && <span className="chip">{t.category.name}</span>}
            {voided && <span className="chip">Anulado</span>}
          </div>
        ) : (
          <p className="truncate text-xs text-muted">{[when, t.member.name, account].filter(Boolean).join(" · ")}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className={`text-[15px] font-bold tabular-nums ${color}`}>{sign}{money(t.amount, t.account.currency)}</span>
        {fx && <span className="text-[11px] text-muted tabular-nums">→ {money(t.toAmount!, t.toAccount!.currency)}</span>}
        {action}
      </div>
    </div>
  );
}
