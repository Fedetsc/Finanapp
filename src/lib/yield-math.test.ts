import { describe, expect, it } from "vitest";
import { canYield, dailyYield } from "./yield-math";
import { parseRate } from "./currency";

describe("rendimientos", () => {
  it("calcula el interés simple de un día", () => {
    expect(dailyYield(10_000_000n, parseRate("36,5"))).toBe(10_000n); // $100.000 al 36,5% = $100
    expect(dailyYield(10_000_000n, parseRate("35"))).toBe(9_589n); // $95,89
  });
  it("compone día a día: el saldo de mañana ya incluye el rendimiento de hoy", () => {
    const r = parseRate("36,5");
    const d1 = dailyYield(10_000_000n, r);
    const d2 = dailyYield(10_000_000n + d1, r);
    expect(d2).toBe(10_010n);
  });
  it("no rinde con saldo cero o negativo", () => {
    expect(dailyYield(0n, parseRate("35"))).toBe(0n);
    expect(dailyYield(-5_000n, parseRate("35"))).toBe(0n);
  });
  it("no aplica a efectivo", () => {
    expect(canYield("CASH")).toBe(false);
    expect(canYield("WALLET")).toBe(true);
  });
});

import { parseYieldForm } from "./yield-math";
import { rateToDecimal } from "./currency";
describe("form de rendimientos", () => {
  const p = (f: Record<string, string>, type = "WALLET") => parseYieldForm(f, type, parseRate, rateToDecimal);
  it("guarda TNA y modo", () => {
    expect(p({ yieldEnabled: "on", yieldRate: "35,5" })).toEqual({ yieldEnabled: true, yieldAnnualRate: "35.5", yieldAutoAccrue: true });
    expect(p({ yieldEnabled: "on", yieldRate: "35", yieldManual: "on" })).toEqual({ yieldEnabled: true, yieldAnnualRate: "35", yieldAutoAccrue: false });
    expect(p({})).toEqual({ yieldEnabled: false });
  });
  it("rechaza efectivo y TNA inválida", () => {
    expect(() => p({ yieldEnabled: "on", yieldRate: "35" }, "CASH")).toThrow();
    expect(() => p({ yieldEnabled: "on", yieldRate: "" })).toThrow();
    expect(() => p({ yieldEnabled: "on", yieldRate: "abc" })).toThrow();
  });
});
