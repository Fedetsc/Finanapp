import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authorizationUrl, exchangeCode, isMpAccount, mpGet, sealTokens } from "./mp";
import { decryptToken, encryptToken } from "./mp-crypto";

const SECRET = "s".repeat(40);
beforeEach(() => {
  vi.stubEnv("MP_CLIENT_ID", "123");
  vi.stubEnv("MP_CLIENT_SECRET", "secreto-de-prueba");
  vi.stubEnv("MP_REDIRECT_URI", "https://finanapp.vercel.app/api/mp/callback");
  vi.stubEnv("MP_TOKEN_SECRET", SECRET);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Mercado Pago", () => {
  it("reconoce cuentas de Mercado Pago por nombre", () => {
    expect(isMpAccount("Mercado Pago")).toBe(true);
    expect(isMpAccount("mercadopago MEP")).toBe(true);
    expect(isMpAccount("Santander Río")).toBe(false);
  });

  it("arma la URL de autorización con state y redirect, sin el client_secret", () => {
    const u = new URL(authorizationUrl("abc"));
    expect(u.origin).toBe("https://auth.mercadopago.com.ar");
    expect(u.searchParams.get("state")).toBe("abc");
    expect(u.searchParams.get("redirect_uri")).toBe("https://finanapp.vercel.app/api/mp/callback");
    expect(u.toString()).not.toContain("secreto-de-prueba");
  });

  it("guarda los tokens cifrados", () => {
    const s = sealTokens({ access_token: "APP_USR-acceso", refresh_token: "TG-refresh", expires_in: 15552000, user_id: 99 });
    expect(s.mpUserId).toBe("99");
    expect(s.accessTokenEnc).not.toContain("APP_USR");
    expect(decryptToken(s.accessTokenEnc)).toBe("APP_USR-acceso");
    expect(decryptToken(s.refreshTokenEnc!)).toBe("TG-refresh");
  });

  it("si Mercado Pago rechaza el code, el error no incluye datos de la respuesta", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant", message: "APP_USR-filtrado" }), { status: 400 })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(exchangeCode("x")).rejects.toThrow(/rechazó/);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("APP_USR");
  });

  it("solo llama a hosts de Mercado Pago / Mercado Libre", async () => {
    const conn = { id: "c", accessTokenEnc: encryptToken("tok"), refreshTokenEnc: null, expiresAt: new Date(Date.now() + 100 * 864e5) };
    await expect(mpGet(conn, "https://evil.example.com/x")).rejects.toThrow(/Host/);
    const f = vi.fn(async () => new Response(JSON.stringify({ id: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const r = await mpGet(conn, "/users/me");
    expect(r).toMatchObject({ status: 200, ok: true });
    expect(f.mock.calls[0][0]).toBe("https://api.mercadopago.com/users/me");
  });
});
