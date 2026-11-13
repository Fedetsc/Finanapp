import { describe, expect, it } from "vitest";
import { addMonths, installmentSchedule, iso, nextCycle, rollForward, splitAmount } from "./dates";

const d = (s: string) => new Date(s + "T00:00:00Z");

describe("suscripciones", () => {
  it("avanza según el ciclo", () => {
    expect(iso(nextCycle(d("2026-12-15"), "MONTHLY"))).toBe("2027-01-15");
    expect(iso(nextCycle(d("2026-12-15"), "YEARLY"))).toBe("2027-12-15");
    expect(iso(nextCycle(d("2026-12-29"), "WEEKLY"))).toBe("2027-01-05");
  });
  it("ajusta fin de mes sin perder el día original", () => {
    expect(iso(addMonths(d("2027-01-31"), 1))).toBe("2027-02-28");
    expect(iso(nextCycle(d("2027-02-28"), "MONTHLY", 31))).toBe("2027-03-31");
    expect(iso(nextCycle(d("2028-02-29"), "YEARLY"))).toBe("2029-02-28");
  });
  it("al reanudar salta a la primera fecha futura", () => {
    expect(iso(rollForward(d("2026-08-15"), "MONTHLY", d("2026-11-13")))).toBe("2026-11-15");
    expect(iso(rollForward(d("2026-08-15"), "MONTHLY", d("2026-11-15")))).toBe("2026-12-15");
  });
});

describe("tarjetas", () => {
  it("compra antes del cierre entra en el resumen del mes", () => {
    const s = installmentSchedule(d("2026-11-10"), 15, 25, 3);
    expect(s.map((x) => [x.number, iso(x.closingDate), iso(x.dueDate)])).toEqual([
      [1, "2026-11-15", "2026-11-25"],
      [2, "2026-12-15", "2026-12-25"],
      [3, "2027-01-15", "2027-01-25"],
    ]);
  });
  it("compra el día del cierre entra; después del cierre pasa al mes siguiente", () => {
    expect(iso(installmentSchedule(d("2026-11-15"), 15, 25, 1)[0].dueDate)).toBe("2026-11-25");
    expect(iso(installmentSchedule(d("2026-11-16"), 15, 25, 1)[0].dueDate)).toBe("2026-12-25");
  });
  it("vencimiento anterior al cierre cae el mes siguiente", () => {
    const [c] = installmentSchedule(d("2026-11-10"), 28, 5, 1);
    expect([iso(c.closingDate), iso(c.dueDate)]).toEqual(["2026-11-28", "2026-12-05"]);
  });
  it("cierre 31 en meses cortos", () => {
    expect(installmentSchedule(d("2027-02-10"), 31, 10, 2).map((x) => iso(x.closingDate))).toEqual(["2027-02-28", "2027-03-31"]);
  });
  it("divide el total sin perder centavos", () => {
    expect(splitAmount(12000000n, 3)).toEqual([4000000n, 4000000n, 4000000n]);
    expect(splitAmount(1000n, 3)).toEqual([334n, 333n, 333n]);
  });
});
