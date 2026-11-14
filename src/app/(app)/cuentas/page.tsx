import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { fail } from "@/lib/action";
import { ACCOUNT_TYPES, toCents } from "@/lib/util";
import { currencyName, money, parseCurrency } from "@/lib/currency";
import CurrencyPicker from "@/components/CurrencyPicker";
import Err from "@/components/Err";
import SubmitButton from "@/components/SubmitButton";
import { IconTile, PageHeader } from "@/components/ui";
import { ACCOUNT_VISUAL } from "@/lib/visuals";
import { accountBalances } from "@/lib/balances";

async function add(fd: FormData) {
  "use server";
  const m = await requireMember();
  try {
    const r = z.object({ name: z.string().trim().min(1).max(50), type: z.enum(["BANK", "SAVINGS", "PAYROLL", "WALLET", "CASH", "INVESTMENT"]), opening: z.string(), currency: z.string(), currencyOther: z.string().optional() }).parse(Object.fromEntries(fd));
    const currency = parseCurrency(r.currency, r.currencyOther);
    // El dueño siempre es quien la crea; no se acepta desde el form.
    await db.account.create({ data: { householdId: m.householdId, ownerMemberId: m.id, name: r.name, type: r.type, currency, openingBalance: toCents(r.opening || "0") } });
  } catch (e) { fail("/cuentas", e); }
  revalidatePath("/", "layout");
  redirect(`/cuentas?ok=${Date.now()}`);
}

/** ver: "mias" (por defecto) | "todas" | id de otro miembro del hogar */
export default async function Cuentas({ searchParams }: { searchParams: { e?: string; ok?: string; ver?: string } }) {
  const m = await requireMember();
  const where = { householdId: m.householdId };
  const [accs, balances, members] = await Promise.all([
    db.account.findMany({ where, orderBy: { createdAt: "asc" } }),
    // Incluye transferencias y lo apartado/retirado de ahorro.
    accountBalances(m.householdId),
    db.member.findMany({ where, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const balance = (id: string, opening: bigint) => balances.get(id) ?? opening;

  const others = members.filter((x) => x.id !== m.id);
  const nameOf = new Map(members.map((x) => [x.id, x.name]));
  const ver = searchParams.ver === "todas" || others.some((o) => o.id === searchParams.ver) ? searchParams.ver! : "mias";
  const shown = accs.filter((a) => (ver === "todas" ? true : ver === "mias" ? a.ownerMemberId === m.id : a.ownerMemberId === ver));
  const filters = [["mias", "Mis cuentas"], ["todas", "Todas"], ...others.map((o) => [o.id, `De ${o.name}`])];
  const empty = ver === "mias" ? "Todavía no tenés cuentas. Agregá la primera para registrar movimientos." : ver === "todas" ? "Todavía no hay cuentas en el hogar." : `${nameOf.get(ver)} todavía no tiene cuentas.`;

  return (
    <div className="space-y-4">
      <PageHeader back={{ href: "/hogar", label: "Hogar" }} title="Cuentas" subtitle={m.household.name} />
      <Err e={searchParams.e} />
      <form key={searchParams.ok} action={add} className="card grid gap-3 md:grid-cols-4">
        <input name="name" required maxLength={50} placeholder="Nombre (ej. Mercado Pago)" aria-label="Nombre" className="input md:col-span-2" />
        <select name="type" aria-label="Tipo de cuenta" className="input">{Object.entries(ACCOUNT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input name="opening" inputMode="decimal" placeholder="Saldo inicial (opcional)" aria-label="Saldo inicial" className="input" />
        <CurrencyPicker className="md:col-span-4" />
        <p className="-mt-1 px-1 text-xs text-muted md:col-span-4">El saldo y los movimientos de la cuenta quedan en esta moneda. No se convierte nada automáticamente.</p>
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
        <ul className="grid gap-3 md:grid-cols-2">
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
                <p className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums">{money(balance(a.id, a.openingBalance), a.currency)}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
