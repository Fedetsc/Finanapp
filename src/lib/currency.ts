// Monedas de las cuentas y tipo de cambio manual. Sin "use client": lo usan server y client.
import { fmt } from "./util";

export const CURRENCIES = {
  ARS: { label: "Peso Argentino", symbol: "$" },
  USD: { label: "Dólar Oficial", symbol: "US$" },
  USD_MEP: { label: "Dólar MEP", symbol: "US$ MEP" },
  EUR: { label: "Euro", symbol: "€" },
} as const;
export type KnownCurrency = keyof typeof CURRENCIES;
export const DEFAULT_CURRENCY = "ARS";

const isKnown = (c: string): c is KnownCurrency => c in CURRENCIES;

/** Código para mostrar: "USD_MEP" -> "USD MEP". */
export const currencyName = (code: string) => code.replace(/_/g, " ");
export const currencySymbol = (code: string) => (isKnown(code) ? CURRENCIES[code].symbol : currencyName(code));

/** Valida lo elegido en el form: una moneda de la lista, u "OTHER" + un código escrito (2 a 10 letras/números). */
export function parseCurrency(selected: string, other?: string): string {
  if (isKnown(selected)) return selected;
  if (selected === "OTHER") {
    const code = (other ?? "").trim().toUpperCase().replace(/\s+/g, "_");
    if (!/^[A-Z0-9_]{2,10}$/.test(code)) throw new Error("Escribí el código de la moneda (2 a 10 letras o números, ej. USDT)");
    return code;
  }
  throw new Error("Elegí una moneda");
}

/** Monto en centavos con el símbolo de la moneda: $1.250,00 · US$ 100,00 · US$ MEP 50,00 · € 10,00. */
export function money(cents: bigint, code: string = DEFAULT_CURRENCY): string {
  const s = fmt(cents);
  if (code === "ARS") return s;
  const neg = s.startsWith("-");
  return `${neg ? "-" : ""}${currencySymbol(code)} ${s.replace(/^-?\$/, "")}`;
}

const SCALE = 1_000_000n; // el tipo de cambio se maneja con 6 decimales

/**
 * Tipo de cambio escrito por el usuario -> entero escalado ×1.000.000.
 * Acepta "1.250", "1.250,50", "1250,5", "1250.5", "0,95". "1.250" se toma como mil doscientos cincuenta.
 */
export function parseRate(input: string): bigint {
  const s = input.trim().replace(/\s/g, "");
  let n: string;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) n = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d+(,\d+)?$/.test(s)) n = s.replace(",", ".");
  else if (/^\d+\.\d+$/.test(s)) n = s;
  else throw new Error("Tipo de cambio inválido. Ejemplo: 1.250,50");
  const [i, d = ""] = n.split(".");
  if (d.length > 6) throw new Error("El tipo de cambio admite hasta 6 decimales");
  if (i.replace(/^0+/, "").length > 12) throw new Error("El tipo de cambio es demasiado grande");
  const v = BigInt(i) * SCALE + BigInt(d.padEnd(6, "0"));
  if (v <= 0n) throw new Error("El tipo de cambio debe ser mayor a cero");
  return v;
}

/** 1250500000n -> "1250.5" (para guardar en Decimal). */
export function rateToDecimal(v: bigint): string {
  const i = v / SCALE, d = (v % SCALE).toString().padStart(6, "0").replace(/0+$/, "");
  return d ? `${i}.${d}` : `${i}`;
}

/** Para mostrar: "1250.5" -> "1.250,5". */
export function formatRate(decimal: string): string {
  const [i, d] = decimal.split(".");
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (d ? "," + d : "");
}

/**
 * Cómo se expresa el tipo de cambio entre dos monedas: "1 {base} = X {quote}".
 * Si una es ARS, siempre en pesos por unidad de la otra (como se habla del dólar). Si no, destino por 1 de origen.
 */
export function rateQuote(from: string, to: string): { base: string; quote: string } {
  if (from === "ARS") return { base: to, quote: "ARS" };
  if (to === "ARS") return { base: from, quote: "ARS" };
  return { base: from, quote: to };
}

const divRound = (n: bigint, d: bigint) => (n + d / 2n) / d; // n, d > 0: redondeo al centavo más cercano

/** Monto que llega a destino (centavos de la moneda destino) para `amount` centavos de origen. */
export function convert(amount: bigint, from: string, to: string, rate: bigint): bigint {
  // rate = cuántas `quote` vale 1 `base`. Si el origen es la base se multiplica; si es la quote, se divide.
  return rateQuote(from, to).base === from ? divRound(amount * rate, SCALE) : divRound(amount * SCALE, rate);
}
