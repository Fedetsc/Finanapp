import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "./mp-crypto";

const S = "x".repeat(40);
const OTHER = "y".repeat(40);

describe("tokens de Mercado Pago cifrados", () => {
  it("ida y vuelta", () => expect(decryptToken(encryptToken("APP_USR-123-abc", S), S)).toBe("APP_USR-123-abc"));
  it("no guarda el token en texto plano y cambia en cada cifrado", () => {
    const a = encryptToken("APP_USR-123-abc", S), b = encryptToken("APP_USR-123-abc", S);
    expect(a).not.toContain("APP_USR");
    expect(a).not.toBe(b);
  });
  it("otro secreto no lo abre", () => expect(() => decryptToken(encryptToken("t", S), OTHER)).toThrow());
  it("si lo modifican, falla", () => {
    const [v, iv, tag, enc] = encryptToken("token-largo", S).split(".");
    const bad = enc.slice(0, -2) + (enc.endsWith("AA") ? "BB" : "AA");
    expect(() => decryptToken([v, iv, tag, bad].join("."), S)).toThrow();
  });
  it("exige un secreto largo", () => {
    expect(() => encryptToken("t", "corto")).toThrow(/MP_TOKEN_SECRET/);
    expect(() => encryptToken("t", undefined)).toThrow(/MP_TOKEN_SECRET/);
  });
});
