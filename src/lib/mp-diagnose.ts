// Diagnóstico de la vinculación: prueba qué endpoints de Mercado Pago responden con la cuenta real.
// Devuelve SOLO un resumen de campos puntuales (montos, fechas, tipos): nunca la respuesta entera ni tokens.
import { mpGet, type MpResult } from "./mp";

export type Probe = { key: string; title: string; why: string; status: number | null; ok: boolean; lines: string[] };
type Conn = Parameters<typeof mpGet>[0];
type Obj = Record<string, unknown>;

const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const str = (v: unknown, max = 40) => (v === null || v === undefined ? "—" : String(v).slice(0, max));
const num = (v: unknown) => (typeof v === "number" || (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v)) ? String(v) : null);
/** Mensaje de error de Mercado Pago (no trae datos sensibles). */
const errLine = (r: MpResult) => r.error ?? (str(obj(r.body).message ?? obj(r.body).error, 80) || "Sin detalle");

function balanceLines(r: MpResult): string[] {
  const b = obj(r.body);
  const fields = ["total_amount", "available_balance", "unavailable_balance", "currency_id"].filter((k) => k in b);
  return fields.length ? fields.map((k) => `${k}: ${num(b[k]) ?? str(b[k], 10)}`) : [`Respondió sin campos de saldo conocidos (campos: ${Object.keys(b).slice(0, 8).join(", ") || "ninguno"})`];
}

function paymentLines(r: MpResult, me: string): string[] {
  const b = obj(r.body);
  const results = Array.isArray(b.results) ? (b.results as unknown[]) : [];
  const total = num(obj(b.paging).total);
  const lines = [`Total informado: ${total ?? "—"} · devueltos: ${results.length}`];
  for (const x of results.slice(0, 10).map(obj)) {
    const role = str(obj(x.collector).id ?? x.collector_id) === me ? "cobré" : str(obj(x.payer).id) === me ? "pagué" : "otro";
    lines.push(`${str(x.date_created, 16).replace("T", " ")} · ${num(x.transaction_amount) ?? "?"} ${str(x.currency_id, 4)} · ${role} · ${str(x.operation_type, 24)} · ${str(x.payment_type_id, 16)} · ${str(x.status, 12)} · ${str(x.description, 30)}`);
  }
  return lines;
}

/** Corre las pruebas en paralelo. `me` = id de usuario de Mercado Pago guardado al vincular. */
export async function diagnose(conn: Conn, me: string): Promise<Probe[]> {
  const search = "sort=date_created&criteria=desc&limit=10";
  const tests: [string, string, string, string, (r: MpResult) => string[]][] = [
    ["me", "Usuario (/users/me)", "Confirma que el token funciona.", "/users/me", (r) => { const b = obj(r.body); return [`id: ${str(b.id)} · país: ${str(b.site_id ?? b.country_id, 4)}`, b.id && String(b.id) !== me ? "⚠ No coincide con el usuario vinculado" : "Coincide con el usuario vinculado"]; }],
    ["bal1", "Saldo (/v1/account/balance)", "El endpoint que pediste. No figura en la documentación oficial.", "/v1/account/balance", balanceLines],
    ["bal2", "Saldo (users/{id}/mercadopago_account/balance)", "Ruta vieja, no documentada, en el host de Mercado Pago.", `/users/${me}/mercadopago_account/balance`, balanceLines],
    ["bal3", "Saldo en api.mercadolibre.com", "La misma ruta vieja en el host de Mercado Libre.", `https://api.mercadolibre.com/users/${me}/mercadopago_account/balance`, balanceLines],
    ["pay", "Pagos (/v1/payments/search)", "Últimos pagos que ve el token, sin filtro.", `/v1/payments/search?${search}`, (r) => paymentLines(r, me)],
    ["payin", "Pagos que cobraste", "Filtrado por collector.id = vos (ingresos).", `/v1/payments/search?${search}&collector.id=${me}`, (r) => paymentLines(r, me)],
    ["payout", "Pagos que hiciste", "Filtrado por payer.id = vos (gastos). Clave para detectar gastos.", `/v1/payments/search?${search}&payer.id=${me}`, (r) => paymentLines(r, me)],
  ];
  return Promise.all(tests.map(async ([key, title, why, url, lines]) => {
    const r = await mpGet(conn, url);
    return { key, title, why, status: r.status, ok: r.ok, lines: r.ok ? lines(r) : [errLine(r)] };
  }));
}
