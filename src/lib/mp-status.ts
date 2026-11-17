// Texto de estado de una cuenta vinculada con Mercado Pago (sin dependencias de servidor).
export type MpStatus = { liveMode: boolean; balance: bigint | null; lastSyncAt: Date | null; syncError: string | null };

/** "hace un momento", "hace 5 min", "hace 3 h", "hace 2 días". */
export function ago(d: Date, now = Date.now()) {
  const min = Math.max(0, Math.floor((now - d.getTime()) / 60000));
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.floor(h / 24);
  return `hace ${days} ${days === 1 ? "día" : "días"}`;
}

/** Estado corto + si está bien (verde) o requiere atención. */
export function mpStatusText(c: MpStatus, now = Date.now()): { text: string; ok: boolean } {
  if (!c.liveMode) return { text: "Vinculada • De prueba (no cambia el saldo real)", ok: false };
  if (c.syncError) return { text: "Vinculada • No se pudo leer el saldo", ok: false };
  if (c.balance !== null && c.lastSyncAt) return { text: `Vinculada • Actualizado ${ago(c.lastSyncAt, now)}`, ok: true };
  return { text: "Vinculada • Falta el saldo inicial", ok: false };
}
