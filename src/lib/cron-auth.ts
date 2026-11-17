import { timingSafeEqual } from "node:crypto";

/** "Authorization: Bearer <CRON_SECRET>" en tiempo constante. Sin CRON_SECRET configurado queda cerrado. */
export function cronAuthorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const a = Buffer.from(header), b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
