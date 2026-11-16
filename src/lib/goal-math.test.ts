import { describe, expect, it } from "vitest";
import { goalLevel, goalPct, incomeShares, splitEqual, splitPercent } from "./goal-math";

describe("goalLevel", () => {
  it("avisa al 90% y al 100%", () => {
    expect(goalLevel(89_99n, 100_00n)).toBe("ok");
    expect(goalLevel(90_00n, 100_00n)).toBe("warn");
    expect(goalLevel(99_99n, 100_00n)).toBe("warn");
    expect(goalLevel(100_00n, 100_00n)).toBe("over");
    expect(goalLevel(150_00n, 100_00n)).toBe("over");
  });
  it("porcentaje gastado", () => expect(goalPct(174_014_00n, 500_000_00n)).toBe(34));
});

describe("divisiones", () => {
  it("partes iguales sin perder centavos", () => {
    expect(splitEqual(500_000_00n, 2)).toEqual([250_000_00n, 250_000_00n]);
    expect(splitEqual(100n, 3)).toEqual([34n, 33n, 33n]);
  });
  it("60/40", () => expect(splitPercent(500_000_00n, [60, 40])).toEqual([300_000_00n, 200_000_00n]));
  it("porcentajes que no suman 100 fallan", () => expect(() => splitPercent(100n, [50, 40])).toThrow());
  it("redondeo al mayor", () => expect(splitPercent(1n, [33, 67]).reduce((a, v) => a + v, 0n)).toBe(1n));
  it("porcentaje según ingresos", () => {
    expect(incomeShares([600n, 400n])).toEqual([60, 40]);
    expect(incomeShares([1n, 2n]).reduce((a, p) => a + p, 0)).toBe(100);
    expect(incomeShares([0n, 0n])).toEqual([50, 50]);
  });
});
