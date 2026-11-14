export const ACCOUNT_TYPES = { BANK: "Cuenta bancaria", SAVINGS: "Caja de ahorro", PAYROLL: "Cuenta sueldo", WALLET: "Billetera virtual", CASH: "Efectivo", INVESTMENT: "Inversión" } as const;

/**
 * "1.250.000,50" -> 125000050n (centavos). El punto es separador de miles y la coma, decimal.
 * Si no hay coma y hay un único punto seguido de 1-2 dígitos ("12.50"), se toma como decimal
 * (teclados de celular que solo muestran punto). Cualquier otro uso ambiguo se rechaza.
 */
export function toCents(input: string): bigint {
  const s = input.trim().replace(/\s/g, "");
  let n: string;
  if (/^\d+\.\d{1,2}$/.test(s)) n = s;
  else if (/^(\d+|\d{1,3}(\.\d{3})+)(,\d{1,2})?$/.test(s)) n = s.replace(/\./g, "").replace(",", ".");
  else throw new Error("Importe inválido. Ejemplo: 1.250,50");
  const [i, d = ""] = n.split(".");
  // Tope razonable (< 10 billones de pesos): evita desbordar el BIGINT de la base con números gigantes.
  if (i.replace(/^0+/, "").length > 13) throw new Error("El importe es demasiado grande");
  return BigInt(i) * 100n + BigInt(d.padEnd(2, "0"));
}
export function fmt(cents: bigint): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  return (neg ? "-$" : "$") + (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + (abs % 100n).toString().padStart(2, "0");
}
export const todayAR = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" });
export const fdate = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");
/** "AAAA-MM-DD" válido (rechaza 2026-02-31) -> Date a medianoche UTC. */
export function parseDate(s: string): Date {
  const d = new Date(s + "T00:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw new Error("La fecha no es válida");
  return d;
}
