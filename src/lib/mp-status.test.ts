import { describe, expect, it } from "vitest";
import { ago, mpStatusText } from "./mp-status";
import { parseBalance, toCentsMp, isTestUser } from "./mp-sync";
import { isLiveToken } from "./mp";

const NOW = Date.parse("2026-11-17T12:00:00Z");
describe("estado de Mercado Pago", () => {
  it("tiempo relativo", () => {
    expect(ago(new Date(NOW - 20_000), NOW)).toBe("hace un momento");
    expect(ago(new Date(NOW - 5 * 60_000), NOW)).toBe("hace 5 min");
    expect(ago(new Date(NOW - 3 * 3600_000), NOW)).toBe("hace 3 h");
    expect(ago(new Date(NOW - 26 * 3600_000), NOW)).toBe("hace 1 día");
  });
  it("texto según el estado", () => {
    expect(mpStatusText({ liveMode: true, balance: 100n, lastSyncAt: new Date(NOW - 120_000), syncError: null }, NOW)).toEqual({ text: "Vinculada • Actualizado hace 2 min", ok: true });
    expect(mpStatusText({ liveMode: false, balance: 100n, lastSyncAt: new Date(NOW), syncError: null }, NOW).text).toMatch(/prueba/);
    expect(mpStatusText({ liveMode: true, balance: null, lastSyncAt: null, syncError: "404" }, NOW).ok).toBe(false);
  });
  it("lee el saldo en centavos (disponible primero)", () => {
    expect(parseBalance({ available_balance: 1250.5, total_amount: 2000, currency_id: "ARS" })).toEqual({ cents: 125050n, currency: "ARS" });
    expect(parseBalance({ total_amount: "99.99" })).toEqual({ cents: 9999n, currency: "ARS" });
    expect(parseBalance({ foo: 1 })).toBeNull();
    expect(toCentsMp("abc")).toBeNull();
  });
  it("detecta credenciales y usuarios de prueba", () => {
    expect(isLiveToken({ access_token: "APP_USR-x", live_mode: true })).toBe(true);
    expect(isLiveToken({ access_token: "APP_USR-x", live_mode: false })).toBe(false);
    expect(isLiveToken({ access_token: "TEST-x" })).toBe(false);
    expect(isTestUser({ tags: ["normal", "test_user"] })).toBe(true);
    expect(isTestUser({ tags: ["normal"] })).toBe(false);
  });
});
