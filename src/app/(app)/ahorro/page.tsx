import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { fail } from "@/lib/action";
import { fdate, fmt, toCents } from "@/lib/util";
import { accountBalances } from "@/lib/balances";
import { today } from "@/lib/billing";
import Err from "@/components/Err";
import SubmitButton from "@/components/SubmitButton";
import { PageHeader, Notice } from "@/components/ui";

const PATH = "/ahorro";
type M = { id: string; householdId: string; userId: string };

/** Cuenta propia (misma regla que movimientos). */
async function ownAccount(id: string, m: M) {
  const a = await db.account.findUnique({ where: { id } });
  if (!a || a.householdId !== m.householdId) throw new Error("Elegí una cuenta válida");
  if (a.ownerMemberId !== m.id) throw new Error("No podés usar la cuenta de otro miembro");
  return a;
}

/** Sobre propio y activo: solo quien lo creó aparta y retira. */
async function ownVault(id: string, m: M) {
  const v = await db.savingsVault.findUnique({ where: { id } });
  if (!v || v.householdId !== m.householdId) throw new Error("Elegí un ahorro válido");
  if (v.memberId !== m.id) throw new Error("Solo quien creó el ahorro puede apartar o retirar");
  if (!v.isActive) throw new Error("Ese ahorro está cerrado");
  return v;
}

const Move = z.object({ vaultId: z.string().min(1), accountId: z.string().min(1), amount: z.string(), description: z.string().trim().max(120).optional() });

async function createVault(fd: FormData) {
  "use server";
  const m = await requireMember();
  try {
    const f = z.object({ name: z.string().trim().min(1).max(40), target: z.string().optional(), emoji: z.string().trim().max(4).optional() }).parse(Object.fromEntries(fd));
    const targetAmount = f.target ? toCents(f.target) : null;
    if (targetAmount !== null && targetAmount <= 0n) throw new Error("La meta debe ser mayor a cero");
    const exists = await db.savingsVault.findUnique({ where: { householdId_name: { householdId: m.householdId, name: f.name } } });
    if (exists) throw new Error("Ya hay un ahorro con ese nombre en el hogar");
    await db.savingsVault.create({ data: { householdId: m.householdId, memberId: m.id, name: f.name, targetAmount, emoji: f.emoji || null } });
  } catch (e) { fail(PATH, e); }
  revalidatePath("/", "layout");
  redirect(`${PATH}?ok=${Date.now()}`);
}

/** APARTAR: sale de mi cuenta y entra al sobre. No es gasto. */
async function deposit(fd: FormData) {
  "use server";
  const m = await requireMember();
  try {
    const f = Move.parse(Object.fromEntries(fd));
    const amount = toCents(f.amount);
    if (amount <= 0n) throw new Error("El importe debe ser mayor a cero");
    const [acc, vault] = await Promise.all([ownAccount(f.accountId, m), ownVault(f.vaultId, m)]);
    await db.$transaction(async (tx) => {
      // Bloquea la cuenta para que dos apartados simultáneos no la dejen en negativo.
      await tx.$queryRaw`SELECT id FROM "Account" WHERE id = ${acc.id} FOR UPDATE`;
      const balance = (await accountBalances(m.householdId, { client: tx, accountId: acc.id })).get(acc.id) ?? 0n;
      if (amount > balance) throw new Error(`No te alcanza: en ${acc.name} tenés ${fmt(balance)}`);
      const v = await tx.savingsVault.updateMany({ where: { id: vault.id, isActive: true }, data: { currentAmount: { increment: amount } } });
      if (v.count !== 1) throw new Error("Ese ahorro está cerrado");
      const mv = await tx.savingsMovement.create({ data: { vaultId: vault.id, householdId: m.householdId, memberId: m.id, accountId: acc.id, type: "DEPOSIT", amount, date: today(), description: f.description ?? "" } });
      await tx.auditLog.create({ data: { householdId: m.householdId, userId: m.userId, action: "DEPOSIT", entity: "SavingsVault", entityId: mv.id } });
    });
  } catch (e) { fail(PATH, e); }
  revalidatePath("/", "layout");
  redirect(`${PATH}?ok=${Date.now()}`);
}

/** RETIRAR: sale del sobre y vuelve a mi cuenta. No es ingreso. */
async function withdraw(fd: FormData) {
  "use server";
  const m = await requireMember();
  try {
    const f = Move.parse(Object.fromEntries(fd));
    const amount = toCents(f.amount);
    if (amount <= 0n) throw new Error("El importe debe ser mayor a cero");
    const [acc, vault] = await Promise.all([ownAccount(f.accountId, m), ownVault(f.vaultId, m)]);
    await db.$transaction(async (tx) => {
      // Descuento condicionado al saldo del sobre: atómico, no puede quedar negativo.
      const v = await tx.savingsVault.updateMany({ where: { id: vault.id, isActive: true, currentAmount: { gte: amount } }, data: { currentAmount: { decrement: amount } } });
      if (v.count !== 1) throw new Error(`No hay tanto en ${vault.name}: tiene ${fmt(vault.currentAmount)}`);
      const mv = await tx.savingsMovement.create({ data: { vaultId: vault.id, householdId: m.householdId, memberId: m.id, accountId: acc.id, type: "WITHDRAW", amount, date: today(), description: f.description ?? "" } });
      await tx.auditLog.create({ data: { householdId: m.householdId, userId: m.userId, action: "WITHDRAW", entity: "SavingsVault", entityId: mv.id } });
    });
  } catch (e) { fail(PATH, e); }
  revalidatePath("/", "layout");
  redirect(`${PATH}?ok=${Date.now()}`);
}

/** Cerrar un sobre vacío (el historial queda). */
async function closeVault(fd: FormData) {
  "use server";
  const m = await requireMember();
  try {
    const v = await ownVault(String(fd.get("id")), m);
    const r = await db.savingsVault.updateMany({ where: { id: v.id, currentAmount: 0n }, data: { isActive: false } });
    if (r.count !== 1) throw new Error("Retirá todo el dinero antes de cerrar el ahorro");
  } catch (e) { fail(PATH, e); }
  revalidatePath("/", "layout");
}

export default async function Ahorro({ searchParams }: { searchParams: { e?: string; ok?: string; vault?: string } }) {
  const m = await requireMember();
  const where = { householdId: m.householdId };
  const [vaults, accounts, balances, moves] = await Promise.all([
    db.savingsVault.findMany({ where, orderBy: [{ isActive: "desc" }, { createdAt: "asc" }], include: { member: { select: { name: true } } } }),
    db.account.findMany({ where: { ...where, ownerMemberId: m.id }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    accountBalances(m.householdId),
    db.savingsMovement.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 20, include: { vault: true, account: true, member: true } }),
  ]);
  const mine = vaults.filter((v) => v.memberId === m.id && v.isActive);
  const total = vaults.reduce((t, v) => t + v.currentAmount, 0n);
  const sel = mine.some((v) => v.id === searchParams.vault) ? searchParams.vault : undefined;
  const accOpt = accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({fmt(balances.get(a.id) ?? 0n)})</option>);
  const vaultOpt = mine.map((v) => <option key={v.id} value={v.id}>{v.emoji ? `${v.emoji} ` : ""}{v.name} ({fmt(v.currentAmount)})</option>);
  const canMove = mine.length > 0 && accounts.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <PageHeader back={{ href: "/hogar", label: "Hogar" }} title="Ahorro" />
          <p className="text-sm text-muted">Plata apartada: no cuenta como disponible para gastar, ni como ingreso o gasto.</p>
        </div>
        <p className="text-right"><span className="block text-xs text-muted">Ahorrado en el hogar</span><span className="text-xl font-semibold">{fmt(total)}</span></p>
      </div>
      <Err e={searchParams.e} />
      {searchParams.ok && <Notice tone="ok">Listo, se guardó.</Notice>}

      {vaults.length === 0 ? (
        <p className="card text-center text-sm text-muted">Todavía no hay ahorros. Creá el primero abajo (ej. «Indemnización»).</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {vaults.map((v) => {
            const own = v.memberId === m.id;
            const pct = v.targetAmount ? Math.min(100, Number((v.currentAmount * 100n) / v.targetAmount)) : null;
            return (
              <li key={v.id} className={`card space-y-2 ${v.isActive ? "" : "opacity-60"}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate font-medium">{v.emoji && <span className="mr-1">{v.emoji}</span>}{v.name}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${!v.isActive ? "bg-line text-muted" : own ? "bg-primary/10 text-primary" : "bg-warn/15 text-warn"}`}>{!v.isActive ? "Cerrado" : own ? "Mío" : `De ${v.member.name}`}</span>
                </div>
                <p className="text-xl font-semibold">{fmt(v.currentAmount)}{v.targetAmount && <span className="text-sm font-normal text-muted"> de {fmt(v.targetAmount)}</span>}</p>
                {pct !== null && (
                  <div>
                    <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Progreso de ${v.name}`}>
                      <div className={`h-full ${pct >= 100 ? "bg-pos" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-muted">{pct >= 100 ? "¡Meta cumplida!" : `${pct}% · faltan ${fmt(v.targetAmount! - v.currentAmount)}`}</p>
                  </div>
                )}
                {own && v.isActive && (
                  <div className="flex items-center gap-3 border-t border-line pt-2 text-sm">
                    <Link href={`${PATH}?vault=${v.id}#apartar`} className="text-primary">Apartar</Link>
                    {v.currentAmount > 0n && <Link href={`${PATH}?vault=${v.id}#retirar`} className="text-primary">Retirar</Link>}
                    {v.currentAmount === 0n && (
                      <form action={closeVault} className="ml-auto"><input type="hidden" name="id" value={v.id} /><button className="text-xs text-muted hover:text-neg">Cerrar ahorro</button></form>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {accounts.length === 0 && <p className="card text-sm text-muted">Para apartar o retirar necesitás <a href="/cuentas" className="text-primary underline">una cuenta tuya</a>.</p>}

      {canMove && (
        <div className="grid gap-3 md:grid-cols-2">
          <form id="apartar" key={`a${searchParams.ok ?? ""}${sel ?? ""}`} action={deposit} className="card space-y-3">
            <h2 className="text-sm font-medium">Apartar</h2>
            <p className="text-xs text-muted">Sale de tu cuenta y queda guardado. No cuenta como gasto.</p>
            <label className="block text-xs text-muted">Desde (tu cuenta)<select name="accountId" required className="input mt-1">{accOpt}</select></label>
            <label className="block text-xs text-muted">Hacia<select name="vaultId" required defaultValue={sel} className="input mt-1">{vaultOpt}</select></label>
            <input name="amount" required inputMode="decimal" placeholder="Importe (ej. 1.500.000)" aria-label="Importe" className="input" />
            <input name="description" maxLength={120} placeholder="Descripción (opcional)" aria-label="Descripción" className="input" />
            <SubmitButton className="btn w-full" pendingText="Guardando...">Apartar</SubmitButton>
          </form>
          <form id="retirar" key={`r${searchParams.ok ?? ""}${sel ?? ""}`} action={withdraw} className="card space-y-3">
            <h2 className="text-sm font-medium">Retirar</h2>
            <p className="text-xs text-muted">Vuelve a tu cuenta para usarlo. No cuenta como ingreso.</p>
            <label className="block text-xs text-muted">Desde<select name="vaultId" required defaultValue={sel} className="input mt-1">{vaultOpt}</select></label>
            <label className="block text-xs text-muted">Hacia (tu cuenta)<select name="accountId" required className="input mt-1">{accOpt}</select></label>
            <input name="amount" required inputMode="decimal" placeholder="Importe (ej. 200.000)" aria-label="Importe" className="input" />
            <input name="description" maxLength={120} placeholder="Descripción (opcional)" aria-label="Descripción" className="input" />
            <SubmitButton className="btn w-full" pendingText="Guardando...">Retirar</SubmitButton>
          </form>
        </div>
      )}

      <form key={`n${searchParams.ok ?? ""}`} action={createVault} className="card grid gap-3 md:grid-cols-[5rem_1fr_1fr_auto]">
        <h2 className="text-sm font-medium md:col-span-4">Crear ahorro</h2>
        <input name="emoji" maxLength={4} placeholder="💰" aria-label="Emoji (opcional)" className="input text-center" />
        <input name="name" required maxLength={40} placeholder="Nombre (ej. Indemnización)" aria-label="Nombre" className="input" />
        <input name="target" inputMode="decimal" placeholder="Meta (opcional)" aria-label="Meta" className="input" />
        <SubmitButton className="btn" pendingText="Creando...">Crear</SubmitButton>
      </form>

      {moves.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Últimos movimientos de ahorro</h2>
          <ul className="card divide-y divide-line py-1">
            {moves.map((mv) => (
              <li key={mv.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate">{mv.type === "DEPOSIT" ? `Apartado: ${mv.account.name} → ${mv.vault.name}` : `Retiro: ${mv.vault.name} → ${mv.account.name}`}</p>
                  <p className="text-xs text-muted">{[fdate(mv.date), mv.member.name, mv.description].filter(Boolean).join(" / ")}</p>
                </div>
                <span className="shrink-0 font-medium text-primary">{mv.type === "DEPOSIT" ? "→ " : "← "}{fmt(mv.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
