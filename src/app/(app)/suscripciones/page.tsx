import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { fail } from "@/lib/action";
import { fdate, fmt, parseDate, toCents } from "@/lib/util";
import { CYCLES, iso, rollForward } from "@/lib/dates";
import { processDueSubscriptions, today } from "@/lib/billing";
import Err from "@/components/Err";
import SubmitButton from "@/components/SubmitButton";
import { PageHeader } from "@/components/ui";

const PATH = "/suscripciones";
const Form = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(60),
  amount: z.string(),
  cycle: z.enum(["WEEKLY", "MONTHLY", "YEARLY"]),
  nextPaymentDate: z.string(),
  accountId: z.string().min(1),
  isActive: z.literal("on").optional(),
});

/** Suscripción del hogar que pertenece al miembro actual (solo el dueño la puede modificar). */
async function mine(id: string, m: { id: string; householdId: string }) {
  const s = await db.subscription.findUnique({ where: { id } });
  if (!s || s.householdId !== m.householdId) throw new Error("Suscripción no encontrada");
  if (s.memberId !== m.id) throw new Error("Solo quien creó la suscripción puede modificarla");
  return s;
}

async function save(fd: FormData) {
  "use server";
  const m = await requireMember();
  try {
    const f = Form.parse(Object.fromEntries(fd));
    const amount = toCents(f.amount);
    if (amount <= 0n) throw new Error("El importe debe ser mayor a cero");
    const nextPaymentDate = parseDate(f.nextPaymentDate);
    // Misma regla que movimientos: la cuenta adherida tiene que ser mía.
    const acc = await db.account.findUnique({ where: { id: f.accountId } });
    if (!acc || acc.householdId !== m.householdId) throw new Error("Elegí una cuenta válida");
    if (acc.ownerMemberId !== m.id) throw new Error("No podés usar la cuenta de otro miembro");
    const data = { name: f.name, amount, cycle: f.cycle, nextPaymentDate, accountId: acc.id, isActive: f.isActive === "on" };
    if (f.id) {
      await mine(f.id, m);
      await db.subscription.update({ where: { id: f.id }, data });
    } else {
      await db.subscription.create({ data: { ...data, householdId: m.householdId, memberId: m.id, currency: "ARS" } });
    }
  } catch (e) { fail(PATH, e); }
  revalidatePath("/", "layout");
  redirect(`${PATH}?ok=${Date.now()}`);
}

async function toggle(fd: FormData) {
  "use server";
  const m = await requireMember();
  try {
    const s = await mine(String(fd.get("id")), m);
    // Al reanudar no se cobran los períodos que pasaron mientras estaba pausada.
    const nextPaymentDate = s.isActive ? s.nextPaymentDate : rollForward(s.nextPaymentDate, s.cycle, today());
    await db.subscription.update({ where: { id: s.id }, data: { isActive: !s.isActive, nextPaymentDate } });
  } catch (e) { fail(PATH, e); }
  revalidatePath("/", "layout");
}

async function remove(fd: FormData) {
  "use server";
  const m = await requireMember();
  try {
    const s = await mine(String(fd.get("id")), m);
    // Los gastos ya cobrados quedan en movimientos (subscriptionId pasa a null).
    await db.subscription.delete({ where: { id: s.id } });
  } catch (e) { fail(PATH, e); }
  revalidatePath("/", "layout");
}

async function processNow() {
  "use server";
  const m = await requireMember();
  const n = await processDueSubscriptions(m.householdId);
  revalidatePath("/", "layout");
  redirect(`${PATH}?cobradas=${n}`);
}

export default async function Suscripciones({ searchParams }: { searchParams: { e?: string; ok?: string; ver?: string; editar?: string; cobradas?: string } }) {
  const m = await requireMember();
  await processDueSubscriptions(m.householdId);
  const where = { householdId: m.householdId };
  const all = searchParams.ver === "todas";
  const [accounts, subs] = await Promise.all([
    db.account.findMany({ where: { ...where, ownerMemberId: m.id }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.subscription.findMany({ where: { ...where, ...(all ? {} : { isActive: true }) }, orderBy: [{ isActive: "desc" }, { nextPaymentDate: "asc" }], include: { account: true, member: true } }),
  ]);
  const editing = subs.find((s) => s.id === searchParams.editar && s.memberId === m.id) ?? null;
  const monthly = subs.filter((s) => s.isActive).reduce((t, s) => t + (s.cycle === "MONTHLY" ? s.amount : s.cycle === "YEARLY" ? s.amount / 12n : (s.amount * 52n) / 12n), 0n);
  const chip = (on: boolean) => `pill ${on ? "pill-on" : ""}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageHeader back={{ href: "/hogar", label: "Hogar" }} title="Suscripciones" />
        <form action={processNow}><button className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:text-text">Procesar vencimientos</button></form>
      </div>
      <Err e={searchParams.e} />
      {searchParams.cobradas && <p className="rounded-lg border border-line bg-surface p-3 text-sm">{searchParams.cobradas === "0" ? "No había suscripciones para cobrar." : `Se registraron ${searchParams.cobradas} cobro(s).`}</p>}

      {accounts.length === 0 ? (
        <p className="card text-center text-sm text-muted">Para adherir una suscripción, primero <a href="/cuentas" className="text-primary underline">creá una cuenta tuya</a>.</p>
      ) : (
        <form key={(editing?.id ?? "") + (searchParams.ok ?? "")} action={save} className="card grid gap-3 md:grid-cols-3">
          <h2 className="text-sm font-medium md:col-span-3">{editing ? `Editar ${editing.name}` : "Nueva suscripción"}</h2>
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <input name="name" required maxLength={60} defaultValue={editing?.name} placeholder="Nombre (ej. Netflix)" aria-label="Nombre" className="input" />
          <input name="amount" required inputMode="decimal" defaultValue={editing ? fmt(editing.amount).slice(1) : undefined} placeholder="Importe (ej. 10.000)" aria-label="Importe" className="input" />
          <select name="cycle" aria-label="Frecuencia" defaultValue={editing?.cycle ?? "MONTHLY"} className="input">{Object.entries(CYCLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <label className="text-xs text-muted">Próximo pago
            <input name="nextPaymentDate" type="date" required defaultValue={editing ? iso(editing.nextPaymentDate) : undefined} className="input mt-1" />
          </label>
          <label className="text-xs text-muted">Se debita de (tu cuenta)
            <select name="accountId" required defaultValue={editing?.accountId} className="input mt-1">{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          </label>
          <label className="flex items-center gap-2 self-end pb-2.5 text-sm"><input type="checkbox" name="isActive" defaultChecked={editing ? editing.isActive : true} className="h-4 w-4 accent-[rgb(var(--primary))]" />Activa</label>
          <div className="flex gap-2 md:col-span-3">
            <SubmitButton className="btn flex-1" pendingText="Guardando...">{editing ? "Guardar cambios" : "Agregar suscripción"}</SubmitButton>
            {editing && <Link href={PATH} className="rounded-lg border border-line px-4 py-2.5 text-sm text-muted">Cancelar</Link>}
          </div>
        </form>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Filtrar suscripciones" className="flex gap-2">
          <Link href={PATH} aria-current={!all ? "page" : undefined} className={chip(!all)}>Activas</Link>
          <Link href={`${PATH}?ver=todas`} aria-current={all ? "page" : undefined} className={chip(all)}>Todas</Link>
        </nav>
        {monthly > 0n && <p className="text-xs text-muted">≈ {fmt(monthly)} por mes en suscripciones activas</p>}
      </div>

      {subs.length === 0 ? (
        <p className="card text-center text-sm text-muted">{all ? "Todavía no hay suscripciones." : "No hay suscripciones activas."}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {subs.map((s) => {
            const own = s.memberId === m.id;
            return (
              <li key={s.id} className={`card space-y-2 ${s.isActive ? "" : "opacity-70"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.name}</p>
                    <p className="text-xs text-muted">{CYCLES[s.cycle]} · {s.account.name}{own ? "" : ` · De ${s.member.name}`}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${s.isActive ? "bg-pos/10 text-pos" : "bg-line text-muted"}`}>{s.isActive ? "Activa" : "Pausada"}</span>
                </div>
                <p className="text-xl font-semibold">{fmt(s.amount)}</p>
                <dl className="grid grid-cols-2 gap-1 text-xs">
                  <div><dt className="text-muted">Próximo pago</dt><dd>{s.isActive ? fdate(s.nextPaymentDate) : "—"}</dd></div>
                  <div><dt className="text-muted">Último cobro</dt><dd>{s.lastChargedDate ? fdate(s.lastChargedDate) : "Todavía no"}</dd></div>
                </dl>
                {own && (
                  <div className="flex items-center gap-3 border-t border-line pt-2 text-xs">
                    <Link href={`${PATH}?editar=${s.id}${all ? "&ver=todas" : ""}`} className="text-primary">Editar</Link>
                    <form action={toggle}><input type="hidden" name="id" value={s.id} /><button className="text-muted hover:text-text">{s.isActive ? "Pausar" : "Reanudar"}</button></form>
                    <details className="ml-auto">
                      <summary className="cursor-pointer list-none text-muted hover:text-neg">Eliminar</summary>
                      <form action={remove} className="mt-1"><input type="hidden" name="id" value={s.id} /><button className="text-neg underline">Confirmar: eliminar</button></form>
                    </details>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
