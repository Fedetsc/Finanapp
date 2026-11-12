import { describe, expect, it } from "vitest";
import { fmt, toCents } from "./util";

describe("dinero", () => {
  it("convierte importes argentinos a centavos", () => {
    expect(toCents("1.250.000,5")).toBe(125000050n);
    expect(toCents("0")).toBe(0n);
  });
  it("rechaza importes inválidos", () => {
    expect(() => toCents("abc")).toThrow();
    expect(() => toCents("-5")).toThrow();
  });
  it("formatea sin errores de precisión", () => {
    expect(fmt(125000000n)).toBe("$1.250.000,00");
    expect(fmt(-5n)).toBe("-$0,05");
  });
});
