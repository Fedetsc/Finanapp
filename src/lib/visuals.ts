// Ícono y color por categoría / tipo de cuenta. Sin "use client": lo usan server y client.

export type Tone = "orange" | "green" | "blue" | "violet" | "pink" | "navy" | "gray";
export type Visual = { icon: string; tone: Tone };

const RULES: [RegExp, Visual][] = [
  [/super|aliment|feria|verdu|comida|mercado|almac/i, { icon: "cart", tone: "orange" }],
  [/vivienda|alquiler|expensa|hogar|casa/i, { icon: "home", tone: "blue" }],
  [/servicio|luz|electric|gas|agua|internet|tel[eé]f/i, { icon: "bolt", tone: "blue" }],
  [/transporte|combust|nafta|auto|uber|colectivo|peaje/i, { icon: "car", tone: "violet" }],
  [/salud|farmac|m[eé]dic|prepaga/i, { icon: "pill", tone: "pink" }],
  [/entreten|ocio|cine|salida|resto|bar/i, { icon: "film", tone: "violet" }],
  [/suscrip/i, { icon: "repeat", tone: "violet" }],
  [/tarjeta|cr[eé]dito|pr[eé]stamo|finanz|cuota/i, { icon: "card", tone: "violet" }],
  [/compra|ropa|regalo/i, { icon: "bag", tone: "orange" }],
  [/educa|curso|colegio|libro/i, { icon: "book", tone: "blue" }],
  [/mascota|veterin/i, { icon: "paw", tone: "orange" }],
  [/impuesto|afip|arba|tasa/i, { icon: "receipt", tone: "pink" }],
  [/ahorro|inversi/i, { icon: "piggy", tone: "green" }],
  [/sueldo|salario|ingreso|honorario|cobro/i, { icon: "wallet", tone: "green" }],
];

export function categoryVisual(name: string | null | undefined, type?: string): Visual {
  if (type === "TRANSFER") return { icon: "transfer", tone: "blue" };
  const hit = name ? RULES.find(([re]) => re.test(name)) : undefined;
  if (hit) return hit[1];
  return type === "INCOME" ? { icon: "wallet", tone: "green" } : { icon: "tag", tone: "gray" };
}

export const ACCOUNT_VISUAL: Record<string, Visual> = {
  BANK: { icon: "bank", tone: "blue" },
  SAVINGS: { icon: "bank", tone: "green" },
  PAYROLL: { icon: "bank", tone: "violet" },
  WALLET: { icon: "wallet", tone: "blue" },
  CASH: { icon: "cash", tone: "green" },
  INVESTMENT: { icon: "trend", tone: "violet" },
};

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "2026-11" -> "Noviembre 2026" */
export const monthLabel = (ym: string, withYear = true) => cap(MONTHS[Number(ym.slice(5, 7)) - 1]) + (withYear ? ` ${ym.slice(0, 4)}` : "");

/** Fecha de calendario relativa a hoy (AAAA-MM-DD): "Hoy", "Ayer", "12 nov". */
export function relDay(d: Date, todayIso: string) {
  const iso = d.toISOString().slice(0, 10);
  if (iso === todayIso) return "Hoy";
  const y = new Date(todayIso + "T00:00:00Z");
  y.setUTCDate(y.getUTCDate() - 1);
  if (iso === y.toISOString().slice(0, 10)) return "Ayer";
  return `${Number(iso.slice(8, 10))} ${SHORT[Number(iso.slice(5, 7)) - 1]}${iso.slice(0, 4) !== todayIso.slice(0, 4) ? ` ${iso.slice(0, 4)}` : ""}`;
}
