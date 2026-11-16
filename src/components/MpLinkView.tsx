// Vista de la vinculación con Mercado Pago (sin consultas: la página le pasa los datos).
import Link from "next/link";
import { unlinkMp } from "@/lib/mp-actions";
import type { Probe } from "@/lib/mp-diagnose";
import { fdate } from "@/lib/util";
import { Icon, IconTile, Notice, PageHeader, SectionHeader } from "./ui";
import Err from "./Err";
import SubmitButton from "./SubmitButton";

type Linked = { mpUserId: string; createdAt: Date; expiresAt: Date; mine: boolean; byName: string };
const OK: Record<string, string> = { vinculada: "Cuenta vinculada con Mercado Pago.", desvinculada: "Cuenta desvinculada. Vuelve a ser manual." };

export default function MpLinkView({ account, linked, canLink, probes, sp }: {
  account: { id: string; name: string }; linked: Linked | null; canLink: string | null; probes: Probe[] | null; sp: { e?: string; ok?: string };
}) {
  const self = `/cuentas/${account.id}/mercadopago`;
  return (
    <div>
      <PageHeader back={{ href: `/cuentas/${account.id}`, label: account.name }} title="Mercado Pago" subtitle="Vinculación (etapa de prueba)" />
      <Err e={sp.e} />
      {sp.ok && OK[sp.ok] && <Notice tone="ok">{OK[sp.ok]}</Notice>}

      <div className="card space-y-3">
        <div className="flex items-center gap-3">
          <IconTile icon="wallet" tone={linked ? "green" : "gray"} />
          <div className="min-w-0 flex-1">
            <p className="font-bold">{linked ? "Vinculada con Mercado Pago" : "Sin vincular"}</p>
            <p className="text-xs text-muted">{linked ? `Usuario ${linked.mpUserId} · por ${linked.byName} el ${fdate(linked.createdAt)} · permiso hasta ${fdate(linked.expiresAt)}` : "La cuenta se maneja a mano, como hasta ahora."}</p>
          </div>
        </div>
        {!linked && (canLink
          ? <p className="rounded-2xl bg-bg px-4 py-3 text-xs text-muted">{canLink}</p>
          : <a href={`/api/mp/connect?accountId=${account.id}`} className="btn w-full"><Icon name="key" className="h-4 w-4" />Vincular con Mercado Pago real</a>)}
        {linked && linked.mine && (
          <div className="flex flex-wrap gap-2">
            <Link href={`${self}?probar=1#diagnostico`} className="btn flex-1">Probar conexión</Link>
            <form action={unlinkMp} className="flex-1"><input type="hidden" name="accountId" value={account.id} /><SubmitButton className="btn-ghost w-full justify-center !text-neg" pendingText="Desvinculando...">Desvincular</SubmitButton></form>
          </div>
        )}
        <p className="text-[11px] text-muted">Por ahora la vinculación no cambia nada de la cuenta: ni el saldo, ni los movimientos, ni los rendimientos. Sirve para ver qué datos da Mercado Pago con tu cuenta antes de sincronizar.</p>
      </div>

      {probes && (
        <section id="diagnostico" className="scroll-mt-6">
          <SectionHeader title="Qué responde Mercado Pago" />
          <ul className="space-y-3">
            {probes.map((p) => (
              <li key={p.key} className="card space-y-2">
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${p.ok ? "bg-mint-soft text-pos" : "bg-[#FDECEE] text-neg dark:bg-neg/15"}`}><Icon name={p.ok ? "check" : "x"} className="h-3.5 w-3.5" strokeWidth={2.6} /></span>
                  <div className="min-w-0 flex-1"><p className="font-semibold">{p.title}</p><p className="text-xs text-muted">{p.why}</p></div>
                  <span className="shrink-0 rounded-full bg-bg px-2 py-0.5 font-mono text-[11px] text-muted">{p.status ?? "—"}</span>
                </div>
                <ul className="space-y-1 rounded-2xl bg-bg p-3 font-mono text-[11px] leading-relaxed text-muted">
                  {p.lines.map((l, i) => <li key={i} className="break-words">{l}</li>)}
                </ul>
              </li>
            ))}
          </ul>
          <p className="mt-3 px-1 text-xs text-muted">Mandame una captura de esta lista (no muestra tokens ni datos de tarjetas) y con eso armo la sincronización real.</p>
        </section>
      )}
    </div>
  );
}
