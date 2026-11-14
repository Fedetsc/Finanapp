import { describe, expect, it } from "vitest";
import { fmt, parseDate, toCents } from "./util";

describe("dinero", () => {
  it("convierte importes argentinos a centavos", () => {
    expect(toCents("1.250.000,5")).toBe(125000050n);
    expect(toCents("0")).toBe(0n);
    expect(toCents("1250")).toBe(125000n);
    expect(toCents("1.250")).toBe(125000n);
    expect(toCents("12,5")).toBe(1250n);
  });
  it("interpreta un punto con 1-2 decimales como separador decimal", () => {
    expect(toCents("12.50")).toBe(1250n);
    expect(toCents("12.5")).toBe(1250n);
  });
  it("rechaza separadores de miles mal agrupados", () => {
    expect(() => toCents("12.50,00")).toThrow();
    expect(() => toCents("1.2345")).toThrow();
    expect(() => toCents("1,234,5")).toThrow();
  });
  it("rechaza importes inválidos", () => {
    expect(() => toCents("abc")).toThrow();
    expect(() => toCents("-5")).toThrow();
    expect(() => toCents("99999999999999999999")).toThrow(); // desbordaría el BIGINT
    expect(toCents("9.999.999.999.999")).toBe(999999999999900n);
  });
  it("formatea sin errores de precisión", () => {
    expect(fmt(125000000n)).toBe("$1.250.000,00");
    expect(fmt(-5n)).toBe("-$0,05");
  });
});

describe("fechas", () => {
  it("acepta fechas válidas", () => {
    expect(parseDate("2026-11-13").toISOString()).toBe("2026-11-13T00:00:00.000Z");
    expect(parseDate("2028-02-29").toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });
  it("rechaza fechas inexistentes o mal formadas", () => {
    expect(() => parseDate("2026-02-31")).toThrow();
    expect(() => parseDate("2026-13-01")).toThrow();
    expect(() => parseDate("13/11/2026")).toThrow();
  });
});
