import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { fail } from "@/lib/action";
import { ACCOUNT_TYPES, fdate, fmt, toCents, todayAR } from "@/lib/util";
import { currencyName, money, parseRate, rateToDecimal } from "@/lib/currency";
import { accountBalances } from "@/lib/balances";
import { arsEquivalent, referenceRates } from "@/lib/rates";
import { accrueYields, rateOf } from "@/lib/yields";
import { canYield, dailyYield, parseYieldForm } from "@/lib/yield-math";
import { today } from "@/lib/billing";
import Err from "@/components/Err";
import Amt, { MASK } from "@/components/Amt";
import YieldFields from "@/components/YieldFields";
import SubmitButton from "@/components/SubmitButton";
import HideAmountsToggle from "@/components/HideAmounts";
import { HeroCard, Notice, PageHeader } from "@/components/ui";

const back = (id: string) => `/cuentas/${encodeURIComponent(id)}`;

/** Activa, desactiva o cambia la TNA. Solo el dueño de la cuenta. La TNA nueva rige desde la próxima acreditación. */
async function saveYield(fd: FormData) {
  "use server";
  const m = await requireMember();
  const id = String(fd.get("id") ?? "");
  try {
    const acc = await db.account.findUnique({ where: { id } });
    if (!acc || acc.householdId !== m.householdId) throw new Error("Cuenta no encontrada");
    if (acc.ownerMemberId !== m.id) throw new Error("Solo el dueño de la cuenta puede cambiar los rendimientos");
    const f = z.object({ yieldEnabled: z.string().optional(), yieldRate: z.string().optional(), yieldManual: z.string().optional() }).parse(Object.fromEntries(fd));
    const y = parseYieldForm(f, acc.type, parseRate, rateToDecimal);
    // Antes de cambiar nada, se acreditan los días pendientes con la configuración vieja (no se recalcula lo viejo).
    await accrueYields(m.householdId);
    const fresh = await db.account.findUniqueOrThrow({ where: { id }, select: { yieldEnabled: true, yieldAutoAccrue: true, lastYieldAt: true } });
    // Al activar (o pasar de informativo a automático) se empieza a contar desde hoy, sin acreditar hacia atrás.
    const restart = y.yieldEnabled && (!fresh.yieldEnabled || !fresh.lastYieldAt || (!fresh.yieldAutoAccrue && y.yieldAutoAccrue));
    await db.account.update({ where: { id }, data: { ...y, ...(restart ? { lastYieldAt: today() } : {}) } });
    await db.auditLog.create({ data: { householdId: m.householdId, userId: m.userId, action: "UPDATE_YIELD", entity: "Account", entityId: id } });
  } catch (e) { fail(back(id), e); }
  revalidatePath("/", "layout");
  redirect(`${back(id)}?ok=${Date.now()}`);
}

/**
 * Editar saldo a mano (solo el dueño): se escribe el saldo real y se ajusta el saldo inicial por la diferencia.
 * No crea movimientos, así que no cuenta como ingreso ni gasto del mes. Los movimientos existentes no cambian.
 */
async function saveBalance(fd: FormData) {
  "use server";
  const m = await requireMember();
  const id = String(fd.get("id") ?? "");
  try {
    const target = toCents(String(fd.get("balance") ?? "").replace("$", ""));
    await db.$transaction(async (tx) => {
      const acc = await tx.account.findUnique({ where: { id }, select: { householdId: true, ownerMemberId: true, openingBalance: true } });
      if (!acc || acc.householdId !== m.householdId) throw new Error("Cuenta no encontrada");
      if (acc.ownerMemberId !== m.id) throw new Error("Solo el dueño de la cuenta puede editar el saldo");
      const current = (await accountBalances(m.householdId, { client: tx, accountId: id })).get(id) ?? acc.openingBalance;
      const diff = target - current;
      if (diff === 0n) return;
      await tx.account.update({ where: { id }, data: { openingBalance: acc.openingBalance + diff } });
      await tx.auditLog.create({ data: { householdId: m.householdId, userId: m.userId, action: "UPDATE_BALANCE", entity: "Account", entityId: id } });
    });
  } catch (e) { fail(back(id), e); }
  revalidatePath("/", "layout");
  redirect(`${back(id)}?saldo=${Date.now()}`);
}

export default async function Cuenta({ params, searchParams }: { params: { id: string }; searchParams: { e?: string; ok?: string; saldo?: string } }) {
  const m = await requireMember();
  await accrueYields(m.householdId);
  const acc = await db.account.findFirst({ where: { id: params.id, householdId: m.householdId }, include: { owner: { select: { name: true } } } });
  if (!acc) notFound();
  const own = acc.ownerMemberId === m.id;
  const monthStart = new Date(todayAR().slice(0, 7) + "-01T00:00:00Z");
  const [balances, rates, yields, monthSum, totalSum] = await Promise.all([
    accountBalances(m.householdId, { accountId: acc.id }),
    referenceRates(m.householdId),
    db.transaction.findMany({ where: { accountId: acc.id, type: "YIELD" }, orderBy: { date: "desc" }, take: 90, select: { id: true, date: true, amount: true, description: true, voidedAt: true } }),
    db.transaction.aggregate({ where: { accountId: acc.id, type: "YIELD", voidedAt: null, date: { gte: monthStart } }, _sum: { amount: true } }),
    db.transaction.aggregate({ where: { accountId: acc.id, type: "YIELD", voidedAt: null }, _sum: { amount: true } }),
  ]);
  const balance = balances.get(acc.id) ?? acc.openingBalance;
  const rate = rateOf(acc.yieldAnnualRate);
  const eq = arsEquivalent(balance, acc.currency, rates);
  const perDay = rate ? dailyYield(balance, rate.scaled) : 0n;
  const cur = acc.currency;

  return (
    <div className="space-y-4">
      <PageHeader back={{ href: "/cuentas", label: "Cuentas" }} title={acc.name} subtitle={`${ACCOUNT_TYPES[acc.type]} · ${currencyName(cur)}${own ? "" : ` · De ${acc.owner.name}`}`} right={<HideAmountsToggle />} />
      <Err e={searchParams.e} />
      {searchParams.ok && <Notice tone="ok">Rendimientos actualizados.</Notice>}
      {searchParams.saldo && <Notice tone="ok">Saldo actualizado.</Notice>}

      <HeroCard>
        <p className="text-sm text-white/70">Saldo</p>
        <p className="mt-1 text-[34px] font-extrabold leading-none tracking-tight tabular-nums"><Amt c={cur}>{money(balance, cur)}</Amt></p>
        {eq && <p className="mt-1 text-xs text-white/60 tabular-nums"><Amt mask={`≈ $ ${MASK}`}>{eq}</Amt></p>}
      </HeroCard>

      {own && (
        <form key={searchParams.saldo} action={saveBalance} className="card space-y-2">
          <input type="hidden" name="id" value={acc.id} />
          <label htmlFor="balance" className="block font-bold">Editar saldo</label>
          <p className="text-xs text-muted">Escribí el saldo real de la cuenta. La diferencia ajusta el saldo inicial: no se crea ningún movimiento.</p>
          <div className="flex gap-2">
            <input id="balance" name="balance" required inputMode="decimal" autoComplete="off" defaultValue={balance >= 0n ? fmt(balance).slice(1) : ""} placeholder="Ej. 161.873,88" aria-label="Saldo real" className="input min-w-0 flex-1" />
            <SubmitButton className="btn shrink-0 px-4" pendingText="...">Guardar</SubmitButton>
          </div>
        </form>
      )}

      <section className="card space-y-3">
        <h2 className="font-bold">Rendimientos</h2>
        {acc.yieldEnabled && rate ? (
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-bg px-3.5 py-2.5"><dt className="text-xs text-muted">TNA</dt><dd className="font-bold">{rate.label}%</dd></div>
            {acc.yieldAutoAccrue ? (
              <div className="rounded-2xl bg-bg px-3.5 py-2.5"><dt className="text-xs text-muted">Generó este mes</dt><dd className="font-bold text-pos tabular-nums"><Amt c={cur}>{money(monthSum._sum.amount ?? 0n, cur)}</Amt></dd></div>
            ) : (
              <div className="rounded-2xl bg-bg px-3.5 py-2.5"><dt className="text-xs text-muted">Estimado por día (informativo)</dt><dd className="font-bold tabular-nums">≈ <Amt c={cur}>{money(perDay, cur)}</Amt></dd></div>
            )}
            <p className="col-span-2 text-xs text-muted">
              {acc.yieldAutoAccrue
                ? <>Se acredita un movimiento por día (≈ <Amt c={cur}>{money(perDay, cur)}</Amt> con el saldo actual). Total acreditado: <Amt c={cur}>{money(totalSum._sum.amount ?? 0n, cur)}</Amt>.{acc.lastYieldAt && ` Último día procesado: ${fdate(acc.lastYieldAt)}.`}</>
                : "El saldo de esta cuenta ya incluye los rendimientos, así que no se acreditan automáticamente."}
            </p>
          </dl>
        ) : (
          <p className="text-sm text-muted">{canYield(acc.type) ? "Esta cuenta no tiene rendimientos activados." : "Las cuentas de efectivo no generan rendimientos."}</p>
        )}

        {own && canYield(acc.type) && (
          <form key={searchParams.ok} action={saveYield} className="space-y-3 border-t border-line pt-3">
            <input type="hidden" name="id" value={acc.id} />
            <YieldFields enabled={acc.yieldEnabled} rate={rate?.label ?? ""} manual={!acc.yieldAutoAccrue} />
            <SubmitButton className="btn w-full" pendingText="Guardando...">Guardar rendimientos</SubmitButton>
          </form>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="px-1 font-bold">Rendimientos acreditados</h2>
        {yields.length === 0 ? (
          <p className="card text-center text-sm text-muted">Todavía no se acreditaron rendimientos en esta cuenta.</p>
        ) : (
          <ul className="card divide-y divide-line py-1">
            {yields.map((y) => (
              <li key={y.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="min-w-0">
                  <span className={`block truncate font-semibold ${y.voidedAt ? "text-muted line-through" : ""}`}>{y.description || "Rendimiento"}</span>
                  <span className="text-xs text-muted">{fdate(y.date)}{y.voidedAt ? " · Anulado" : ""}</span>
                </span>
                <span className={`shrink-0 font-bold tabular-nums ${y.voidedAt ? "text-muted line-through" : "text-pos"}`}>+<Amt c={cur}>{money(y.amount, cur)}</Amt></span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
