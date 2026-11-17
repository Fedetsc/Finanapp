// Validación de la firma de los webhooks de Mercado Pago (header x-signature).
import { createHmac, timingSafeEqual } from "node:crypto";

/** "ts=1704908010,v1=abc..." -> { ts, v1 } */
export function parseSignature(header: string | null) {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(",")) {
    const [k, v] = part.split("=").map((x) => x?.trim());
    if (k && v) out[k] = v;
  }
  return out.ts && out.v1 ? { ts: out.ts, v1: out.v1 } : null;
}

/**
 * Template oficial: "id:[data.id];request-id:[x-request-id];ts:[ts];" (si falta un valor, se quita esa parte).
 * El data.id alfanumérico va en minúsculas. Firma = HMAC-SHA256 en hex con la clave secreta del webhook.
 */
export function validSignature(opts: { header: string | null; requestId: string | null; dataId: string | null; secret: string | undefined }) {
  const sig = parseSignature(opts.header);
  if (!sig || !opts.secret) return false;
  const id = opts.dataId ? (/^[a-z0-9]+$/i.test(opts.dataId) ? opts.dataId.toLowerCase() : opts.dataId) : null;
  const manifest = `${id ? `id:${id};` : ""}${opts.requestId ? `request-id:${opts.requestId};` : ""}ts:${sig.ts};`;
  const expected = createHmac("sha256", opts.secret).update(manifest).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(sig.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}
