import { describe, expect, it } from "vitest";
import { convert, formatRate, money, parseCurrency, parseRate, rateQuote, rateToDecimal } from "./currency";

describe("monedas", () => {
  it("valida la moneda elegida", () => {
    expect(parseCurrency("ARS")).toBe("ARS");
    expect(parseCurrency("USD_MEP")).toBe("USD_MEP");
    expect(parseCurrency("OTHER", " usdt ")).toBe("USDT");
    expect(() => parseCurrency("OTHER", "")).toThrow();
    expect(() => parseCurrency("XYZ")).toThrow();
  });
  it("formatea con el símbolo de cada moneda", () => {
    expect(money(125000n, "ARS")).toBe("$1.250,00");
    expect(money(10000n, "USD")).toBe("US$ 100,00");
    expect(money(-5000n, "USD_MEP")).toBe("-US$ MEP 50,00");
    expect(money(1000n, "EUR")).toBe("€ 10,00");
    expect(money(1000n, "USDT")).toBe("USDT 10,00");
  });
});

describe("tipo de cambio", () => {
  it("interpreta formatos argentinos", () => {
    expect(parseRate("1.250")).toBe(1_250_000_000n);
    expect(parseRate("1.250,50")).toBe(1_250_500_000n);
    expect(parseRate("1250.5")).toBe(1_250_500_000n);
    expect(parseRate("0,95")).toBe(950_000n);
    expect(() => parseRate("0")).toThrow();
    expect(() => parseRate("-3")).toThrow();
    expect(() => parseRate("abc")).toThrow();
  });
  it("guarda y muestra el tipo de cambio", () => {
    expect(rateToDecimal(1_250_500_000n)).toBe("1250.5");
    expect(rateToDecimal(1_250_000_000n)).toBe("1250");
    expect(formatRate("1250.5")).toBe("1.250,5");
  });
  it("expresa el cambio en pesos por unidad de la otra moneda", () => {
    expect(rateQuote("USD_MEP", "ARS")).toEqual({ base: "USD_MEP", quote: "ARS" });
    expect(rateQuote("ARS", "USD_MEP")).toEqual({ base: "USD_MEP", quote: "ARS" });
    expect(rateQuote("EUR", "USD")).toEqual({ base: "EUR", quote: "USD" });
  });
  it("convierte al monto de destino", () => {
    const r = parseRate("1.200");
    expect(convert(10000n, "USD_MEP", "ARS", r)).toBe(12000000n); // US$ 100 -> $120.000
    expect(convert(12000000n, "ARS", "USD_MEP", r)).toBe(10000n); // $120.000 -> US$ 100
    expect(convert(100000n, "ARS", "USD", r)).toBe(83n); // $1.000 -> US$ 0,83 (redondeo)
    expect(convert(10000n, "EUR", "USD", parseRate("1,08"))).toBe(10800n);
  });
});
