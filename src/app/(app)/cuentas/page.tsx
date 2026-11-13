import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { fail } from "@/lib/action";
import { ACCOUNT_TYPES, fmt, toCents } from "@/lib/util";
import Err from "@/components/Err";
import { accountBalances } from "@/lib/balances";

async function add(fd: FormData) {
  "use server";
  const m = await requireMember();
  try {
    const r = z.object({ name: z.string().trim().min(1).max(50), type: z.enum(["BANK", "SAVINGS", "PAYROLL", "WALLET", "CASH", "INVESTMENT"]), opening: z.string() }).parse(Object.fromEntries(fd));
    // El dueño siempre es quien la crea; no se acepta desde el form.
    await db.account.create({ data: { householdId: m.householdId, ownerMemberId: m.id, name: r.name, type: r.type, openingBalance: toCents(r.opening || "0") } });
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
      <h1 className="text-xl font-semibold">Cuentas</h1>
      <Err e={searchParams.e} />
      <form key={searchParams.ok} action={add} className="card grid gap-3 md:grid-cols-4">
        <input name="name" required placeholder="Nombre (ej. Mercado Pago)" className="input md:col-span-2" />
        <select name="type" className="input">{Object.entries(ACCOUNT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input name="opening" inputMode="decimal" placeholder="Saldo inicial (opcional)" className="input" />
        <button className="btn md:col-span-4">Agregar cuenta</button>
      </form>
      <nav aria-label="Filtrar cuentas" className="flex flex-wrap gap-2">
        {filters.map(([k, l]) => (
          <Link key={k} href={k === "mias" ? "/cuentas" : `/cuentas?ver=${k}`} aria-current={ver === k ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm ${ver === k ? "border-primary bg-primary text-surface" : "border-line text-muted"}`}>{l}</Link>
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
                  <p className="text-xs text-muted">{ACCOUNT_TYPES[a.type]}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${mine ? "bg-primary/10 text-primary" : "bg-warn/15 text-warn"}`}>
                    {mine ? "Mía" : `De ${nameOf.get(a.ownerMemberId) ?? "otro miembro"}`}
                  </span>
                </div>
                <p className="font-medium">{a.name}</p>
                <p className="mt-2 text-xl font-semibold">{fmt(balance(a.id, a.openingBalance))}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
