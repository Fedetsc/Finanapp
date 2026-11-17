import { describe, expect, it } from "vitest";
import { ago, mpStatusText } from "./mp-status";
import { paymentDelta, toCentsMp, isTestUser } from "./mp-sync";
import { pruneBody } from "./mp-diagnose";
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
  it("suma cobros netos y resta pagos aprobados desde el saldo inicial", () => {
    const since = new Date("2026-11-10T00:00:00Z");
    const base = { status: "approved", currency_id: "ARS", date_approved: "2026-11-12T10:00:00.000-03:00" };
    expect(paymentDelta({ ...base, collector: { id: 9 }, payer: { id: 5 }, transaction_amount: 1000, transaction_details: { net_received_amount: 950.5 } }, "9", "ARS", since)).toBe(95050n);
    expect(paymentDelta({ ...base, collector_id: 5, payer: { id: 9 }, transaction_amount: 300, transaction_details: { total_paid_amount: 312.4 } }, "9", "ARS", since)).toBe(-31240n);
    expect(paymentDelta({ ...base, status: "rejected", collector: { id: 9 }, transaction_amount: 10 }, "9", "ARS", since)).toBeNull();
    expect(paymentDelta({ ...base, date_approved: "2026-11-01T00:00:00Z", collector: { id: 9 }, transaction_amount: 10 }, "9", "ARS", since)).toBeNull();
    expect(paymentDelta({ ...base, currency_id: "USD", collector: { id: 9 }, transaction_amount: 10 }, "9", "ARS", since)).toBeNull();
    expect(paymentDelta({ ...base, collector: { id: 1 }, payer: { id: 2 }, transaction_amount: 10 }, "9", "ARS", since)).toBeNull();
    expect(toCentsMp("abc")).toBeNull();
  });
  it("el body del diagnóstico oculta datos sensibles", () => {
    const out = JSON.stringify(pruneBody({ id: 1, email: "a@b.c", payer: { identification: { number: "123" }, id: 2 }, results: [1, 2, 3, 4], access_token: "APP_USR-x" }));
    expect(out).not.toContain("a@b.c");
    expect(out).not.toContain("APP_USR");
    expect(out).not.toContain("123");
    expect(out).toContain("y 2 más");
  });
  it("detecta credenciales y usuarios de prueba", () => {
    expect(isLiveToken({ access_token: "APP_USR-x", live_mode: true })).toBe(true);
    expect(isLiveToken({ access_token: "APP_USR-x", live_mode: false })).toBe(false);
    expect(isLiveToken({ access_token: "TEST-x" })).toBe(false);
    expect(isTestUser({ tags: ["normal", "test_user"] })).toBe(true);
    expect(isTestUser({ tags: ["normal"] })).toBe(false);
  });
});
