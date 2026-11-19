import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { fail } from "@/lib/action";
import { ACCOUNT_TYPES, fdate, toCents } from "@/lib/util";
import { currencyName, currencySymbol, formatRate, money, parseCurrency, parseRate, rateToDecimal } from "@/lib/currency";
import { arsEquivalent, referenceRates } from "@/lib/rates";
import CurrencyPicker from "@/components/CurrencyPicker";
import HideAmountsToggle from "@/components/HideAmounts";
import Err from "@/components/Err";
import SubmitButton from "@/components/SubmitButton";
import { IconTile, Notice, PageHeader } from "@/components/ui";
import { ACCOUNT_VISUAL } from "@/lib/visuals";
import { accountBalances } from "@/lib/balances";
import Amt, { MASK } from "@/components/Amt";
import YieldFields from "@/components/YieldFields";
import { parseYieldForm } from "@/lib/yield-math";
import { accrueYields, rateOf } from "@/lib/yields";
import { today } from "@/lib/billing";
import { todayAR } from "@/lib/util";

async function add(fd: FormData) {
  "use server";
  const m = await requireMember();
  try {
    const r = z.object({ name: z.string().trim().min(1).max(50), type: z.enum(["BANK", "SAVINGS", "PAYROLL", "WALLET", "CASH", "INVESTMENT"]), opening: z.string(), currency: z.string(), currencyOther: z.string().optional(), yieldEnabled: z.string().optional(), yieldRate: z.string().optional(), yieldManual: z.string().optional() }).parse(Object.fromEntries(fd));
    const currency = parseCurrency(r.currency, r.currencyOther);
    // Rendimientos: arrancan a contar desde hoy (el primero se acredita mañana).
    const y = parseYieldForm(r, r.type, parseRate, rateToDecimal);
    const yieldData = y.yieldEnabled ? { ...y, lastYieldAt: today() } : {};
    // El dueño siempre es quien la crea; no se acepta desde el form.
    await db.account.create({ data: { householdId: m.householdId, ownerMemberId: m.id, name: r.name, type: r.type, currency, openingBalance: toCents(r.opening || "0"), ...yieldData } });
  } catch (e) { fail("/cuentas", e); }
  revalidatePath("/", "layout");
  redirect(`/cuentas?ok=${Date.now()}`);
}

/** Actualiza la cotización de referencia de una moneda del hogar (pesos por 1 unidad). Cualquier miembro puede hacerlo. */
async function saveRate(fd: FormData) {
  "use server";
  const m = await requireMember();
  try {
    const r = z.object({ currency: z.string().min(1).max(10), rate: z.string().min(1, "Poné la cotización") }).parse(Object.fromEntries(fd));
    if (r.currency === "ARS") throw new Error("El peso no necesita cotización");
    // Solo monedas que usa alguna cuenta de este hogar.
    const used = await db.account.findFirst({ where: { householdId: m.householdId, currency: r.currency }, select: { id: true } });
    if (!used) throw new Error("Ninguna cuenta del hogar usa esa moneda");
    const rate = rateToDecimal(parseRate(r.rate));
    await db.exchangeRate.upsert({
      where: { householdId_currency: { householdId: m.householdId, currency: r.currency } },
      create: { householdId: m.householdId, currency: r.currency, rate, updatedByMemberId: m.id },
      update: { rate, updatedByMemberId: m.id },
    });
  } catch (e) { fail("/cuentas", e instanceof z.ZodError ? new Error(e.issues[0]?.message ?? "Revisá la cotización") : e); }
  revalidatePath("/", "layout");
  redirect(`/cuentas?cotizacion=${Date.now()}#cotizaciones`);
}

/** ver: "mias" (por defecto) | "todas" | id de otro miembro del hogar */
export default async function Cuentas({ searchParams }: { searchParams: { e?: string; ok?: string; ver?: string; cotizacion?: string; eliminada?: string } }) {
  const m = await requireMember();
  const where = { householdId: m.householdId };
  await accrueYields(m.householdId); // rendimientos pendientes (por si el cron no corrió)
  const monthStart = new Date(todayAR().slice(0, 7) + "-01T00:00:00Z");
  const [accs, balances, members, rates, yieldsMonth] = await Promise.all([
    db.account.findMany({ where, orderBy: { createdAt: "asc" } }),
    // Incluye transferencias y lo apartado/retirado de ahorro.
    accountBalances(m.householdId),
    db.member.findMany({ where, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    referenceRates(m.householdId),
    db.transaction.groupBy({ by: ["accountId"], where: { ...where, type: "YIELD", voidedAt: null, date: { gte: monthStart } }, _sum: { amount: true } }),
  ]);
  const yieldOf = new Map(yieldsMonth.map((y) => [y.accountId, y._sum.amount ?? 0n]));
  // Monedas extranjeras usadas en el hogar: cada una tiene su cotización de referencia editable.
  const foreign = [...new Set(accs.map((a) => a.currency).filter((c) => c !== "ARS"))].sort();
  const balance = (id: string, opening: bigint) => balances.get(id) ?? opening;

  const others = members.filter((x) => x.id !== m.id);
  const nameOf = new Map(members.map((x) => [x.id, x.name]));
  const ver = searchParams.ver === "todas" || others.some((o) => o.id === searchParams.ver) ? searchParams.ver! : "mias";
  const shown = accs.filter((a) => (ver === "todas" ? true : ver === "mias" ? a.ownerMemberId === m.id : a.ownerMemberId === ver));
  const filters = [["mias", "Mis cuentas"], ["todas", "Todas"], ...others.map((o) => [o.id, `De ${o.name}`])];
  const empty = ver === "mias" ? "Todavía no tenés cuentas. Agregá la primera para registrar movimientos." : ver === "todas" ? "Todavía no hay cuentas en el hogar." : `${nameOf.get(ver)} todavía no tiene cuentas.`;

  return (
    <div className="space-y-4">
      <PageHeader back={{ href: "/hogar", label: "Hogar" }} title="Cuentas" subtitle={m.household.name} right={<HideAmountsToggle />} />
      <Err e={searchParams.e} />
      {searchParams.eliminada && <Notice tone="ok">Cuenta eliminada.</Notice>}
      <form key={searchParams.ok} action={add} className="card grid gap-3 md:grid-cols-4">
        <input name="name" required maxLength={50} placeholder="Nombre (ej. Mercado Pago)" aria-label="Nombre" className="input md:col-span-2" />
        <select name="type" aria-label="Tipo de cuenta" className="input">{Object.entries(ACCOUNT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input name="opening" inputMode="decimal" placeholder="Saldo inicial (opcional)" aria-label="Saldo inicial" className="input" />
        <CurrencyPicker className="md:col-span-4" />
        <p className="-mt-1 px-1 text-xs text-muted md:col-span-4">El saldo y los movimientos de la cuenta quedan en esta moneda. No se convierte nada automáticamente.</p>
        <YieldFields className="md:col-span-4" />
        <SubmitButton className="btn md:col-span-4" pendingText="Guardando...">Agregar cuenta</SubmitButton>
      </form>
      <nav aria-label="Filtrar cuentas" className="flex flex-wrap gap-2">
        {filters.map(([k, l]) => (
          <Link key={k} href={k === "mias" ? "/cuentas" : `/cuentas?ver=${k}`} aria-current={ver === k ? "page" : undefined}
            className={`pill shrink-0 ${ver === k ? "pill-on" : ""}`}>{l}</Link>
        ))}
      </nav>
      {shown.length === 0 ? (
        <p className="card text-center text-sm text-muted">{empty}</p>
      ) : (
        <ul className="stagger grid gap-3 md:grid-cols-2">
          {shown.map((a) => {
            const mine = a.ownerMemberId === m.id;
            return (
              <li key={a.id} className="card">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-3"><IconTile icon={(ACCOUNT_VISUAL[a.type] ?? ACCOUNT_VISUAL.BANK).icon} tone={(ACCOUNT_VISUAL[a.type] ?? ACCOUNT_VISUAL.BANK).tone} /><span className="text-xs text-muted">{ACCOUNT_TYPES[a.type]} · {currencyName(a.currency)}</span></span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${mine ? "bg-primary/10 text-primary" : "bg-warn/15 text-warn"}`}>
                    {mine ? "Mía" : `De ${nameOf.get(a.ownerMemberId) ?? "otro miembro"}`}
                  </span>
                </div>
                <p className="mt-3 font-bold">{a.name}</p>
                <p className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums"><Amt c={a.currency}>{money(balance(a.id, a.openingBalance), a.currency)}</Amt></p>
                {a.currency !== "ARS" && (
                  <p className="mt-0.5 text-xs text-muted tabular-nums">
                    {arsEquivalent(balance(a.id, a.openingBalance), a.currency, rates) ? <Amt mask={`≈ $ ${MASK}`}>{arsEquivalent(balance(a.id, a.openingBalance), a.currency, rates)}</Amt> : <a href="#cotizaciones" className="underline">Cargá la cotización para ver el equivalente en pesos</a>}
                  </p>
                )}
                {a.yieldEnabled && a.yieldAnnualRate && (
                  <p className="mt-2 inline-flex flex-wrap items-center gap-1 rounded-full bg-mint-soft px-2.5 py-1 text-xs font-semibold text-pos">
                    Rinde {rateOf(a.yieldAnnualRate)!.label}% TNA ·{" "}
                    {a.yieldAutoAccrue
                      ? <>Generó <Amt c={a.currency}>{money(yieldOf.get(a.id) ?? 0n, a.currency)}</Amt> este mes</>
                      : "informativo (el saldo ya lo incluye)"}
                  </p>
                )}
                <Link href={`/cuentas/${a.id}`} className="mt-3 block text-sm font-semibold text-primary">Ver detalle</Link>
              </li>
            );
          })}
        </ul>
      )}

      {foreign.length > 0 && (
        <section id="cotizaciones" className="card scroll-mt-6 space-y-3">
          <div>
            <h2 className="font-bold">Cotización de referencia</h2>
            <p className="text-xs text-muted">Solo sirve para ver el equivalente en pesos. Actualizala cuando quieras: no cambia saldos ni transferencias ya hechas.</p>
          </div>
          {searchParams.cotizacion && <p role="status" className="rounded-2xl bg-mint-soft px-3 py-2 text-xs font-medium text-pos">Cotización actualizada.</p>}
          <ul className="space-y-3">
            {foreign.map((c) => {
              const r = rates.get(c);
              return (
                <li key={c}>
                  <form key={`${c}${searchParams.cotizacion ?? ""}`} action={saveRate} className="flex flex-wrap items-center gap-2 text-sm">
                    <input type="hidden" name="currency" value={c} />
                    <span className="shrink-0 font-semibold">1 {currencyName(c)} =</span>
                    <span className="shrink-0 text-muted">{currencySymbol("ARS")}</span>
                    <input name="rate" required inputMode="decimal" autoComplete="off" defaultValue={r ? formatRate(r.decimal) : ""} placeholder="Ej. 1.250,50"
                      aria-label={`Pesos por 1 ${currencyName(c)}`} className="input w-36 min-w-0 flex-1" />
                    <SubmitButton className="btn shrink-0 px-4" pendingText="...">Guardar</SubmitButton>
                  </form>
                  <p className="mt-1 px-1 text-[11px] text-muted">{r ? `Actualizada el ${fdate(r.updatedAt)}` : "Todavía sin cotización"}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
