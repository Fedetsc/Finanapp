import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseSignature, validSignature } from "./mp-webhook";
import { pendingFrom } from "./mp-sync";

const SECRET = "clave-de-prueba";
const sign = (manifest: string) => createHmac("sha256", SECRET).update(manifest).digest("hex");

describe("webhook de Mercado Pago", () => {
  it("lee ts y v1 del header", () => {
    expect(parseSignature("ts=123,v1=abc")).toEqual({ ts: "123", v1: "abc" });
    expect(parseSignature("v1=abc")).toBeNull();
    expect(parseSignature(null)).toBeNull();
  });
  it("acepta la firma correcta con el template oficial", () => {
    const v1 = sign("id:123456;request-id:req-1;ts:1704908010;");
    expect(validSignature({ header: `ts=1704908010,v1=${v1}`, requestId: "req-1", dataId: "123456", secret: SECRET })).toBe(true);
  });
  it("pasa a minúsculas el data.id alfanumérico y quita partes ausentes", () => {
    const v1 = sign("id:abc123;ts:99;");
    expect(validSignature({ header: `ts=99,v1=${v1}`, requestId: null, dataId: "ABC123", secret: SECRET })).toBe(true);
  });
  it("rechaza firma cambiada, otro id o sin secreto", () => {
    const v1 = sign("id:1;request-id:r;ts:1;");
    expect(validSignature({ header: `ts=1,v1=${v1}`, requestId: "r", dataId: "2", secret: SECRET })).toBe(false);
    expect(validSignature({ header: `ts=1,v1=${v1.slice(0, -1) + (v1.endsWith("0") ? "1" : "0")}`, requestId: "r", dataId: "1", secret: SECRET })).toBe(false);
    expect(validSignature({ header: `ts=1,v1=${v1}`, requestId: "r", dataId: "1", secret: undefined })).toBe(false);
  });
});

describe("pendientes desde pagos", () => {
  it("transferencia entrante con nombre", () => {
    const p = pendingFrom({ id: 77, operation_type: "money_transfer", payer: { first_name: "Karu", last_name: "" }, date_approved: "2026-11-17T10:00:00.000-03:00", description: "Varios" }, 2000000n);
    expect(p).toMatchObject({ mpPaymentId: "77", direction: "IN", kind: "TRANSFER", amount: 2000000n, counterpart: "Karu", description: "Varios" });
  });
  it("pago saliente sin nombre", () => {
    const p = pendingFrom({ id: 8, operation_type: "regular_payment", date_created: "2026-11-17T10:00:00Z" }, -150000n);
    expect(p).toMatchObject({ direction: "OUT", kind: "PAYMENT", amount: 150000n, counterpart: null });
  });
});
