import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { fail } from "@/lib/action";
import { fmt, toCents } from "@/lib/util";
import { refreshInstallments } from "@/lib/billing";
import { pendingByCard } from "@/lib/cards";
import Err from "@/components/Err";
import SubmitButton from "@/components/SubmitButton";
import { PageHeader } from "@/components/ui";

const day = z.coerce.number().int().min(1, "El día tiene que estar entre 1 y 31").max(31, "El día tiene que estar entre 1 y 31");

async function add(fd: FormData) {
  "use server";
  const m = await requireMember();
  try {
    const f = z.object({
      name: z.string().trim().min(1).max(60),
      bank: z.string().trim().min(1).max(60),
      last4: z.string().trim().regex(/^(\d{4})?$/, "Los últimos 4 tienen que ser 4 números"),
      limit: z.string(),
      closingDay: day,
      dueDay: day,
    }).parse(Object.fromEntries(fd));
    const limit = toCents(f.limit);
    if (limit <= 0n) throw new Error("El límite debe ser mayor a cero");
    // El dueño siempre es quien la crea.
    await db.creditCard.create({ data: { householdId: m.householdId, ownerMemberId: m.id, name: f.name, bank: f.bank, last4: f.last4 || null, limit, closingDay: f.closingDay, dueDay: f.dueDay } });
  } catch (e) { fail("/tarjetas", e instanceof z.ZodError ? new Error(e.issues[0]?.message ?? "Revisá los datos") : e); }
  revalidatePath("/", "layout");
  redirect(`/tarjetas?ok=${Date.now()}`);
}

export default async function Tarjetas({ searchParams }: { searchParams: { e?: string; ok?: string } }) {
  const m = await requireMember();
  await refreshInstallments(m.householdId);
  const cards = await db.creditCard.findMany({ where: { householdId: m.householdId }, orderBy: { createdAt: "asc" }, include: { owner: { select: { name: true } } } });
  const pending = await pendingByCard(cards.map((c) => c.id));
  const awaiting = await db.installment.findMany({ where: { status: "AWAITING_CONFIRMATION", purchase: { householdId: m.householdId, status: "ACTIVE" } }, select: { purchase: { select: { cardId: true } } } });
  const awaitingByCard = new Map<string, number>();
  awaiting.forEach(({ purchase: { cardId } }) => awaitingByCard.set(cardId, (awaitingByCard.get(cardId) ?? 0) + 1));

  return (
    <div className="space-y-4">
      <PageHeader back={{ href: "/hogar", label: "Hogar" }} title="Tarjetas" subtitle="Tarjetas de crédito" />
      <Err e={searchParams.e} />
      <form key={searchParams.ok} action={add} className="card grid gap-3 md:grid-cols-3">
        <h2 className="text-sm font-medium md:col-span-3">Nueva tarjeta</h2>
        <input name="name" required maxLength={60} placeholder="Nombre (ej. Visa Galicia)" aria-label="Nombre" className="input" />
        <input name="bank" required maxLength={60} placeholder="Banco" aria-label="Banco" className="input" />
        <input name="last4" inputMode="numeric" pattern="\d{4}" maxLength={4} placeholder="Últimos 4 (opcional)" aria-label="Últimos 4" className="input" />
        <input name="limit" required inputMode="decimal" placeholder="Límite (ej. 500.000)" aria-label="Límite" className="input" />
        <label className="text-xs text-muted">Día de cierre<input name="closingDay" type="number" min={1} max={31} required className="input mt-1" /></label>
        <label className="text-xs text-muted">Día de vencimiento<input name="dueDay" type="number" min={1} max={31} required className="input mt-1" /></label>
        <SubmitButton className="btn md:col-span-3" pendingText="Guardando...">Agregar tarjeta</SubmitButton>
      </form>

      {cards.length === 0 ? (
        <p className="card text-center text-sm text-muted">Todavía no hay tarjetas.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {cards.map((c) => {
            const own = c.ownerMemberId === m.id;
            const used = pending.get(c.id) ?? 0n;
            const pct = Number((used * 100n) / (c.limit || 1n));
            const wait = awaitingByCard.get(c.id) ?? 0;
            return (
              <li key={c.id} className="card space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.name}{c.last4 && <span className="text-muted"> ···· {c.last4}</span>}</p>
                    <p className="text-xs text-muted">{c.bank} · Cierra el {c.closingDay} · Vence el {c.dueDay}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${own ? "bg-primary/10 text-primary" : "bg-warn/15 text-warn"}`}>{own ? "Mía" : `De ${c.owner.name}`}</span>
                </div>
                <div>
                  <div className="flex justify-between text-xs"><span className="text-muted">Disponible</span><span className="text-muted">Límite {fmt(c.limit)}</span></div>
                  <p className="text-xl font-semibold">{fmt(c.limit - used)}</p>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line" role="img" aria-label={`${pct}% del límite usado`}>
                    <div className={`h-full ${pct > 85 ? "bg-neg" : "bg-primary"}`} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </div>
                {wait > 0 && <p className="rounded-lg bg-warn/15 px-2 py-1 text-xs text-warn">{wait} cuota(s) esperando confirmación</p>}
                <div className="flex gap-3 border-t border-line pt-2 text-sm">
                  <Link href={`/tarjetas/${c.id}`} className="text-primary">Ver detalle</Link>
                  {own && c.isActive && <Link href={`/tarjetas/${c.id}#gasto`} className="text-muted hover:text-text">Agregar gasto</Link>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
