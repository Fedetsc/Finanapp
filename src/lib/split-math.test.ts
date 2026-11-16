import { describe, expect, it } from "vitest";
import { amountShares, balances, equalShares, pendingDebts, percentShares, readShares, simplify, writeShares } from "./split-math";

const P = ["fede", "karu", "juan"];
const all = (amount: bigint) => equalShares(amount, P);

describe("asado (criterio de aceptación)", () => {
  // Carne $30.000 pagó Fede, Bebida $9.000 pagó Karu, entre 3: le toca $13.000 a cada uno.
  const exps = [
    { paidBy: "fede", amount: 30_000_00n, shares: all(30_000_00n) },
    { paidBy: "karu", amount: 9_000_00n, shares: all(9_000_00n) },
  ];
  it("balances: pagado - parte", () => {
    const b = balances(P, exps);
    expect(b.get("fede")).toEqual({ paid: 30_000_00n, owed: 13_000_00n, net: 17_000_00n });
    expect(b.get("karu")).toEqual({ paid: 9_000_00n, owed: 13_000_00n, net: -4_000_00n });
    expect(b.get("juan")).toEqual({ paid: 0n, owed: 13_000_00n, net: -13_000_00n });
  });
  it("Juan le debe $13.000 a Fede y Karu $4.000 a Fede", () => {
    expect(pendingDebts(P, exps)).toEqual([
      { from: "juan", to: "fede", amount: 13_000_00n },
      { from: "karu", to: "fede", amount: 4_000_00n },
    ]);
  });
  it("una deuda saldada desaparece de pendientes", () => {
    expect(pendingDebts(P, exps, [{ from: "karu", to: "fede", amount: 4_000_00n }])).toEqual([{ from: "juan", to: "fede", amount: 13_000_00n }]);
  });
  it("saldar todo deja todo en cero", () => {
    const debts = pendingDebts(P, exps);
    expect(pendingDebts(P, exps, debts)).toEqual([]);
  });
  it("pago parcial deja el resto", () => {
    expect(pendingDebts(P, exps, [{ from: "juan", to: "fede", amount: 3_000_00n }])[0]).toEqual({ from: "juan", to: "fede", amount: 10_000_00n });
  });
});

describe("simplificación", () => {
  it("cadena Karu -> Fede -> Juan se resuelve con menos transferencias", () => {
    // Karu debe 10.000 (neto) y Fede debe 5.000 a Juan: neto Karu -10.000, Fede +5.000, Juan +5.000.
    const net = new Map([["fede", 5_000_00n], ["karu", -10_000_00n], ["juan", 5_000_00n]]);
    expect(simplify(P, net)).toEqual([
      { from: "karu", to: "fede", amount: 5_000_00n },
      { from: "karu", to: "juan", amount: 5_000_00n },
    ]);
  });
  it("como mucho n-1 transferencias y suma cero", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const exps = [
      { paidBy: "a", amount: 100_00n, shares: equalShares(100_00n, ids) },
      { paidBy: "b", amount: 77_77n, shares: equalShares(77_77n, ["b", "c", "d"]) },
      { paidBy: "e", amount: 50_01n, shares: equalShares(50_01n, ["a", "e"]) },
    ];
    const debts = pendingDebts(ids, exps);
    expect(debts.length).toBeLessThanOrEqual(ids.length - 1);
    expect(pendingDebts(ids, exps, debts)).toEqual([]);
  });
  it("nadie debe nada si cada uno pagó su parte", () => {
    const exps = P.map((id) => ({ paidBy: id, amount: 30_00n, shares: all(30_00n) }));
    expect(pendingDebts(P, exps)).toEqual([]);
  });
});

describe("partes", () => {
  it("iguales sin perder centavos", () => expect(equalShares(100n, P)).toEqual({ fede: 34n, karu: 33n, juan: 33n }));
  it("por % (los de 0% quedan afuera)", () => expect(percentShares(1_000_00n, { fede: 70, karu: 30, juan: 0 })).toEqual({ fede: 700_00n, karu: 300_00n }));
  it("% que no suman 100 fallan", () => expect(() => percentShares(1_000_00n, { fede: 70, karu: 20 })).toThrow());
  it("montos que no suman el total fallan", () => {
    expect(amountShares(1_000_00n, { fede: 600_00n, karu: 400_00n })).toEqual({ fede: 600_00n, karu: 400_00n });
    expect(() => amountShares(1_000_00n, { fede: 600_00n, karu: 300_00n })).toThrow();
  });
  it("un participante agregado después no cambia gastos viejos", () => {
    const old = { paidBy: "fede", amount: 20_00n, shares: equalShares(20_00n, ["fede", "karu"]) };
    expect(pendingDebts([...P, "nuevo"], [old])).toEqual([{ from: "karu", to: "fede", amount: 10_00n }]);
  });
  it("ida y vuelta por JSON", () => expect(readShares({ shares: writeShares({ a: 5n, b: 12345678901234n }) })).toEqual({ a: 5n, b: 12345678901234n }));
});
