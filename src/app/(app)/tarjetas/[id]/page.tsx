import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { fail } from "@/lib/action";
import { fdate, fmt, parseDate, toCents, todayAR } from "@/lib/util";
import { dayOf, installmentSchedule, splitAmount } from "@/lib/dates";
import { payInstallments, refreshInstallments, today } from "@/lib/billing";
import { pendingByCard, STATUS_CLS, STATUS_LABEL } from "@/lib/cards";
import Err from "@/components/Err";
import SubmitButton from "@/components/SubmitButton";
import { Notice, PageHeader } from "@/components/ui";
import AdvancePay from "@/components/AdvancePay";

const back = (id: string) => `/tarjetas/${id}`;

/** Tarjeta del hogar cuyo dueño es el miembro actual. */
async function ownCard(id: string, m: { id: string; householdId: string }) {
  const c = await db.creditCard.findUnique({ where: { id } });
  if (!c || c.householdId !== m.householdId) throw new Error("Tarjeta no encontrada");
  if (c.ownerMemberId !== m.id) throw new Error("No podés cargar gastos en la tarjeta de otro miembro");
  return c;
}

async function addPurchase(fd: FormData) {
  "use server";
  const m = await requireMember();
  const cardId = String(fd.get("cardId"));
  try {
    const f = z.object({
      description: z.string().trim().min(1).max(80),
      total: z.string(),
      installments: z.coerce.number().int().min(1, "Entre 1 y 12 cuotas").max(12, "Entre 1 y 12 cuotas"),
      purchaseDate: z.string(),
    }).parse(Object.fromEntries(fd));
    const card = await ownCard(cardId, m);
    if (!card.isActive) throw new Error("La tarjeta está desactivada");
    const total = toCents(f.total);
    if (total <= 0n) throw new Error("El monto debe ser mayor a cero");
    const purchaseDate = parseDate(f.purchaseDate);
    const used = (await pendingByCard([card.id])).get(card.id) ?? 0n;
    if (total > card.limit - used) throw new Error(`Supera el disponible de la tarjeta (${fmt(card.limit - used)})`);

    const amounts = splitAmount(total, f.installments);
    const schedule = installmentSchedule(purchaseDate, card.closingDay, card.dueDay, f.installments);
    await db.$transaction(async (tx) => {
      const p = await tx.creditCardPurchase.create({
        data: {
          cardId: card.id, householdId: m.householdId, memberId: m.id, description: f.description, totalAmount: total, installmentsCount: f.installments, purchaseDate,
          installments: { create: schedule.map((s, i) => ({ ...s, amount: amounts[i] })) },
        },
      });
      await tx.auditLog.create({ data: { householdId: m.householdId, userId: m.userId, action: "CREATE", entity: "CreditCardPurchase", entityId: p.id } });
    });
    // Si la compra es vieja, alguna cuota ya puede estar en un resumen cerrado.
    await refreshInstallments(m.householdId);
  } catch (e) { fail(back(cardId), e instanceof z.ZodError ? new Error(e.issues[0]?.message ?? "Revisá los datos") : e); }
  revalidatePath("/", "layout");
  redirect(`${back(cardId)}?ok=${Date.now()}`);
}

/** Confirmación manual de una cuota cuyo resumen ya cerró. */
async function confirm(fd: FormData) {
  "use server";
  const m = await requireMember();
  const cardId = String(fd.get("cardId"));
  try {
    await payInstallments(m, cardId, [String(fd.get("id"))], String(fd.get("accountId")), true);
  } catch (e) { fail(back(cardId), e); }
  revalidatePath("/", "layout");
  redirect(`${back(cardId)}?pagado=1`);
}

/** Adelantar pago de una o varias cuotas (pendientes o esperando confirmación). */
async function advance(fd: FormData) {
  "use server";
  const m = await requireMember();
  const cardId = String(fd.get("cardId"));
  try {
    const ids = fd.getAll("ids").map(String);
    await payInstallments(m, cardId, ids, String(fd.get("accountId")), false);
  } catch (e) { fail(back(cardId), e); }
  revalidatePath("/", "layout");
  redirect(`${back(cardId)}?pagado=1`);
}

async function cancel(fd: FormData) {
  "use server";
  const m = await requireMember();
  const cardId = String(fd.get("cardId"));
  try {
    const card = await ownCard(cardId, m);
    // Solo compras sin cuotas pagadas: lo pagado ya salió de una cuenta.
    const r = await db.creditCardPurchase.updateMany({ where: { id: String(fd.get("id")), cardId: card.id, status: "ACTIVE", installmentsPaid: 0 }, data: { status: "CANCELLED" } });
    if (r.count !== 1) throw new Error("Solo se puede cancelar una compra activa sin cuotas pagadas");
    await db.auditLog.create({ data: { householdId: m.householdId, userId: m.userId, action: "CANCEL", entity: "CreditCardPurchase", entityId: String(fd.get("id")) } });
  } catch (e) { fail(back(cardId), e); }
  revalidatePath("/", "layout");
}

export default async function Tarjeta({ params, searchParams }: { params: { id: string }; searchParams: { e?: string; ok?: string; pagado?: string } }) {
  const m = await requireMember();
  await refreshInstallments(m.householdId);
  const card = await db.creditCard.findFirst({ where: { id: params.id, householdId: m.householdId }, include: { owner: { select: { name: true } } } });
  if (!card) notFound();
  const own = card.ownerMemberId === m.id;
  const [purchases, accounts, pending] = await Promise.all([
    db.creditCardPurchase.findMany({ where: { cardId: card.id }, orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }], include: { installments: { orderBy: { number: "asc" } }, member: { select: { name: true } } } }),
    own ? db.account.findMany({ where: { householdId: m.householdId, ownerMemberId: m.id }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve([]),
    pendingByCard([card.id]),
  ]);

  const t = today();
  const endOfMonth = dayOf(t.getUTCFullYear(), t.getUTCMonth(), 31);
  const unpaid = purchases.filter((p) => p.status === "ACTIVE").flatMap((p) => p.installments.filter((i) => i.status !== "PAID").map((i) => ({ ...i, purchase: p })))
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.number - b.number);
  const awaiting = unpaid.filter((i) => i.status === "AWAITING_CONFIRMATION");
  const thisMonth = unpaid.filter((i) => i.dueDate <= endOfMonth).reduce((s, i) => s + i.amount, 0n);
  const used = pending.get(card.id) ?? 0n;
  const label = (i: (typeof unpaid)[number]) => `Cuota ${i.number}/${i.purchase.installmentsCount} · ${i.purchase.description}`;
  const Stat = ({ l, v, c }: { l: string; v: string; c?: string }) => <div className="card"><p className="text-xs text-muted">{l}</p><p className={`mt-1 text-lg font-semibold ${c ?? ""}`}>{v}</p></div>;

  return (
    <div className="space-y-4">
      <PageHeader back={{ href: "/tarjetas", label: "Tarjetas" }} title={<>{card.name}{card.last4 && <span className="text-muted"> ···· {card.last4}</span>}</>} />
      <p className="-mt-3 mb-4 text-sm text-muted">{card.bank} · Cierra el {card.closingDay} · Vence el {card.dueDay}{own ? "" : ` · De ${card.owner.name}`}</p>
      <Err e={searchParams.e} />
      {searchParams.ok && <Notice tone="ok">Gasto en cuotas agregado.</Notice>}
      {searchParams.pagado && <Notice tone="ok">Pago registrado. Ya se descontó de tu cuenta.</Notice>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat l="Límite" v={fmt(card.limit)} />
        <Stat l="Disponible" v={fmt(card.limit - used)} />
        <Stat l="A pagar hasta fin de mes" v={fmt(thisMonth)} c="text-neg" />
        <Stat l="Esperando confirmación" v={String(awaiting.length)} c={awaiting.length ? "text-warn" : ""} />
      </div>

      {own && accounts.length === 0 && <p className="card text-sm text-muted">Para pagar cuotas necesitás <a href="/cuentas" className="text-primary underline">una cuenta tuya</a>.</p>}

      {awaiting.length > 0 && (
        <section className="card space-y-2">
          <h2 className="text-sm font-medium">Cuotas esperando confirmación</h2>
          <p className="text-xs text-muted">El resumen ya cerró. Confirmá cada cuota cuando la pagues: recién ahí se descuenta de tu cuenta.</p>
          <ul className="divide-y divide-line">
            {awaiting.map((i) => (
              <li key={i.id} className="py-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0"><span className="block truncate">{label(i)}</span><span className="text-xs text-muted">Vence {fdate(i.dueDate)}</span></span>
                  <span className="shrink-0 font-medium">{fmt(i.amount)}</span>
                </div>
                {own && accounts.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-sm text-primary">Confirmar pago</summary>
                    <form action={confirm} className="mt-2 flex flex-col gap-2 md:flex-row md:items-end">
                      <input type="hidden" name="cardId" value={card.id} />
                      <input type="hidden" name="id" value={i.id} />
                      <label className="flex-1 text-xs text-muted">¿Con qué cuenta abonaste esta cuota?
                        <select name="accountId" required className="input mt-1">{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
                      </label>
                      <SubmitButton className="btn" pendingText="Registrando...">Confirmar {fmt(i.amount)}</SubmitButton>
                    </form>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {own && card.isActive && (
        <form id="gasto" key={searchParams.ok} action={addPurchase} className="card grid gap-3 md:grid-cols-2">
          <h2 className="text-sm font-medium md:col-span-2">Agregar gasto en cuotas</h2>
          <input type="hidden" name="cardId" value={card.id} />
          <input name="description" required maxLength={80} placeholder="Descripción (ej. Heladera)" aria-label="Descripción" className="input md:col-span-2" />
          <input name="total" required inputMode="decimal" placeholder="Monto total (ej. 120.000)" aria-label="Monto total" className="input" />
          <select name="installments" aria-label="Cantidad de cuotas" defaultValue="1" className="input">{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} {i ? "cuotas" : "cuota"}</option>)}</select>
          <label className="text-xs text-muted md:col-span-2">Fecha de compra<input name="purchaseDate" type="date" required defaultValue={todayAR()} className="input mt-1" /></label>
          <p className="text-xs text-muted md:col-span-2">No cuenta como gasto ahora: cada cuota se registra como gasto cuando la confirmás o la adelantás.</p>
          <SubmitButton className="btn md:col-span-2" pendingText="Guardando...">Agregar gasto</SubmitButton>
        </form>
      )}

      {own && accounts.length > 0 && unpaid.length > 0 && (
        <details className="card" id="adelantar">
          <summary className="cursor-pointer text-sm font-medium">Adelantar pago</summary>
          <div className="mt-3">
            <AdvancePay action={advance} cardId={card.id} accounts={accounts}
              items={unpaid.map((i) => ({ id: i.id, label: label(i), detail: `Vence ${fdate(i.dueDate)} · ${STATUS_LABEL[i.status]}`, cents: i.amount.toString() }))} />
          </div>
        </details>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Compras</h2>
        {purchases.length === 0 ? (
          <p className="card text-center text-sm text-muted">Todavía no hay compras en esta tarjeta.</p>
        ) : purchases.map((p) => (
          <article key={p.id} className={`card space-y-2 ${p.status === "CANCELLED" ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className={`truncate font-medium ${p.status === "CANCELLED" ? "line-through" : ""}`}>{p.description}</p>
                <p className="text-xs text-muted">{fdate(p.purchaseDate)} · {p.installmentsPaid}/{p.installmentsCount} cuotas pagadas · {p.member.name}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold">{fmt(p.totalAmount)}</p>
                <p className="text-xs text-muted">{p.status === "PAID" ? "Pagada" : p.status === "CANCELLED" ? "Cancelada" : "Activa"}</p>
              </div>
            </div>
            {p.status !== "CANCELLED" && (
              <ul className="space-y-1 text-xs">
                {p.installments.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2">
                    <span>Cuota {i.number} · vence {fdate(i.dueDate)}</span>
                    <span className="flex items-center gap-2"><span>{fmt(i.amount)}</span><span className={`rounded-full px-2 py-0.5 ${STATUS_CLS[i.status]}`}>{STATUS_LABEL[i.status]}</span></span>
                  </li>
                ))}
              </ul>
            )}
            {own && p.status === "ACTIVE" && p.installmentsPaid === 0 && (
              <form action={cancel}><input type="hidden" name="cardId" value={card.id} /><input type="hidden" name="id" value={p.id} /><button className="text-xs text-muted hover:text-neg">Cancelar compra</button></form>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
