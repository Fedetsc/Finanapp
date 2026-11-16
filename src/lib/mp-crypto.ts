// Cifrado de los tokens de Mercado Pago. SOLO servidor (usa node:crypto y MP_TOKEN_SECRET).
// AES-256-GCM: cifra y además detecta si alguien modificó el texto guardado.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";

/** Clave de 32 bytes derivada del secreto. Exige un secreto largo para que no se pueda adivinar. */
function keyFrom(secret: string | undefined): Buffer {
  if (!secret || secret.length < 32) throw new Error("Falta configurar MP_TOKEN_SECRET (mínimo 32 caracteres)");
  return createHash("sha256").update(secret, "utf8").digest();
}

/** Texto -> "v1.iv.tag.cifrado" (base64url). Cada llamada usa un iv distinto. */
export function encryptToken(plain: string, secret = process.env.MP_TOKEN_SECRET): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [VERSION, iv.toString("base64url"), c.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}

/** Inversa de encryptToken. Falla si el texto fue modificado o el secreto es otro. */
export function decryptToken(stored: string, secret = process.env.MP_TOKEN_SECRET): string {
  const [v, iv, tag, enc] = stored.split(".");
  if (v !== VERSION || !iv || !tag || !enc) throw new Error("Token guardado con formato inválido");
  const d = createDecipheriv("aes-256-gcm", keyFrom(secret), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
}
