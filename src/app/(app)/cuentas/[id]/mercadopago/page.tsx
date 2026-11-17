import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { isMpAccount } from "@/lib/mp";
import { diagnose } from "@/lib/mp-diagnose";
import MpLinkView from "@/components/MpLinkView";

export const dynamic = "force-dynamic";

/** Vinculación de una cuenta con Mercado Pago + diagnóstico de qué endpoints responden. */
export default async function MercadoPago({ params, searchParams: sp }: { params: { id: string }; searchParams: { e?: string; ok?: string; probar?: string } }) {
  const m = await requireMember();
  const acc = await db.account.findFirst({
    where: { id: params.id, householdId: m.householdId },
    select: { id: true, name: true, ownerMemberId: true, mpConnection: { select: { id: true, mpUserId: true, memberId: true, createdAt: true, expiresAt: true, liveMode: true, balance: true, balanceCurrency: true, lastSyncAt: true, syncError: true, accessTokenEnc: true, refreshTokenEnc: true, member: { select: { name: true } } } } },
  });
  if (!acc) notFound();
  const c = acc.mpConnection;
  const canLink = acc.ownerMemberId !== m.id ? "Solo el dueño de la cuenta la puede vincular." : !isMpAccount(acc.name) ? "Solo se pueden vincular cuentas que se llamen \"Mercado Pago\"." : null;
  // Las pruebas usan el token de quien vinculó: solo las puede correr esa persona, y solo al tocar "Probar conexión".
  const probes = c && c.memberId === m.id && sp.probar === "1" ? await diagnose(c, c.mpUserId) : null;
  return (
    <MpLinkView account={{ id: acc.id, name: acc.name }} canLink={canLink} probes={probes} sp={sp}
      linked={c ? { mpUserId: c.mpUserId, createdAt: c.createdAt, expiresAt: c.expiresAt, mine: c.memberId === m.id, byName: c.member.name, liveMode: c.liveMode, balance: c.balance, balanceCurrency: c.balanceCurrency, lastSyncAt: c.lastSyncAt, syncError: c.syncError } : null} />
  );
}
