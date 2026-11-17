// Vista de la vinculación con Mercado Pago (sin consultas: la página le pasa los datos).
import Link from "next/link";
import { refreshMpBalance, setMpBase, unlinkMp } from "@/lib/mp-actions";
import { mpStatusText } from "@/lib/mp-status";
import { money } from "@/lib/currency";
import Amt from "./Amt";
import type { Probe } from "@/lib/mp-diagnose";
import { fdate } from "@/lib/util";
import { Icon, IconTile, Notice, PageHeader, SectionHeader } from "./ui";
import Err from "./Err";
import SubmitButton from "./SubmitButton";

type Linked = { mpUserId: string; createdAt: Date; expiresAt: Date; mine: boolean; byName: string; liveMode: boolean; balance: bigint | null; balanceCurrency: string | null; lastSyncAt: Date | null; syncError: string | null; baseBalance: bigint | null; baseAt: Date | null };
const OK: Record<string, string> = { vinculada: "Cuenta vinculada con Mercado Pago.", desvinculada: "Cuenta desvinculada. Vuelve a ser manual.", saldo: "Saldo sincronizado.", base: "Saldo inicial guardado. Desde ahora se suman los pagos de Mercado Pago.", "ajuste-mas": "Saldo corregido. La diferencia quedó como un ingreso \"Ajuste de saldo\" en Movimientos.", "ajuste-menos": "Saldo corregido. La diferencia quedó como un gasto \"Ajuste de saldo\" en Movimientos." };

export default function MpLinkView({ account, linked, canLink, probes, sp }: {
  account: { id: string; name: string; currency: string }; linked: Linked | null; canLink: string | null; probes: Probe[] | null; sp: { e?: string; ok?: string };
}) {
  const self = `/cuentas/${account.id}/mercadopago`;
  return (
    <div>
      <PageHeader back={{ href: `/cuentas/${account.id}`, label: account.name }} title="Mercado Pago" subtitle="Vinculación" />
      <Err e={sp.e} />
      {sp.ok && OK[sp.ok] && <Notice tone="ok">{OK[sp.ok]}</Notice>}

      <div className="card space-y-3">
        <div className="flex items-center gap-3">
          <IconTile icon="wallet" tone={linked ? "green" : "gray"} />
          <div className="min-w-0 flex-1">
            <p className="font-bold">{linked ? mpStatusText(linked).text : "Sin vincular"}</p>
            <p className="text-xs text-muted">{linked ? `Usuario ${linked.mpUserId} · por ${linked.byName} el ${fdate(linked.createdAt)} · permiso hasta ${fdate(linked.expiresAt)}` : "La cuenta se maneja a mano, como hasta ahora."}</p>
          </div>
        </div>
        {linked && (
          <div className="rounded-2xl bg-bg px-4 py-3">
            <p className="text-xs text-muted">{linked.liveMode ? "Saldo en Mercado Pago" : "Saldo de la cuenta de prueba (no se usa)"}</p>
            <p className="text-xl font-extrabold tabular-nums">{linked.balance !== null ? <Amt c={account.currency}>{money(linked.balance, account.currency)}</Amt> : "—"}</p>
            {linked.baseBalance !== null && linked.baseAt && <p className="mt-1 text-xs text-muted">Saldo inicial <Amt c={account.currency}>{money(linked.baseBalance, account.currency)}</Amt> el {fdate(linked.baseAt)} + pagos aprobados desde entonces</p>}
            {linked.syncError && <p className="mt-1 text-xs text-neg">{linked.syncError}</p>}
          </div>
        )}
        {!linked && (canLink
          ? <p className="rounded-2xl bg-bg px-4 py-3 text-xs text-muted">{canLink}</p>
          : <a href={`/api/mp/connect?accountId=${account.id}`} className="btn w-full"><Icon name="key" className="h-4 w-4" />Vincular con Mercado Pago real</a>)}
        {linked && linked.mine && (
          <form id="saldo-inicial" action={setMpBase} className="scroll-mt-6 space-y-2 rounded-2xl border border-line p-3">
            <input type="hidden" name="accountId" value={account.id} />
            <label htmlFor="mp-base" className="block text-sm font-semibold">{linked.baseBalance === null ? "Saldo inicial" : "Corregir saldo"}</label>
            <p className="text-xs text-muted">Escribí el saldo disponible que ves ahora en la app de Mercado Pago. Desde este momento se le suman y restan los pagos.{linked.baseBalance !== null && " La diferencia con el saldo calculado se guarda como un movimiento \"Ajuste de saldo\", que podés recategorizar."}</p>
            <div className="flex gap-2">
              <input id="mp-base" name="base" required inputMode="decimal" autoComplete="off" placeholder="Ej. 125.000,50" className="input min-w-0 flex-1" />
              <SubmitButton className="btn shrink-0 px-4" pendingText="...">Guardar</SubmitButton>
            </div>
          </form>
        )}
        {linked && linked.mine && (
          <div className="flex flex-wrap gap-2">
            <form action={refreshMpBalance} className="flex-1"><input type="hidden" name="accountId" value={account.id} /><SubmitButton className="btn w-full" pendingText="Sincronizando...">Sincronizar</SubmitButton></form>
            <Link href={`${self}?probar=1#diagnostico`} className="btn-ghost flex-1 justify-center">Probar conexión</Link>
            <form action={unlinkMp} className="flex-1"><input type="hidden" name="accountId" value={account.id} /><SubmitButton className="btn-ghost w-full justify-center !text-neg" pendingText="Desvinculando...">Desvincular</SubmitButton></form>
          </div>
        )}
        <p className="text-[11px] text-muted">Mercado Pago no tiene un endpoint oficial de saldo: se calcula con el saldo inicial + los pagos aprobados (cobros suman, pagos restan). Si el saldo se desvía (por ejemplo por transferencias o rendimientos que no vienen como pagos), corregilo arriba y la diferencia queda como ajuste. Una cuenta de prueba nunca cambia el saldo real.</p>
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
                <p className={`text-sm font-semibold ${p.ok ? "text-pos" : "text-neg"}`}>{p.summary}</p>
                <p className="break-all rounded-xl bg-bg px-3 py-2 font-mono text-[11px] text-muted">{p.endpoint}</p>
                {p.body && (
                  <details open={!p.ok}>
                    <summary className="cursor-pointer text-xs font-semibold text-muted">Body de la respuesta</summary>
                    <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-2xl bg-bg p-3 font-mono text-[11px] leading-relaxed text-muted">{p.body}</pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 px-1 text-xs text-muted">El body está recortado y oculta tokens, email, documento, teléfono y datos de tarjetas.</p>
        </section>
      )}
    </div>
  );
}
