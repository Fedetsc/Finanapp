// "Probar conexión": muestra qué endpoint se llamó, qué status devolvió Mercado Pago y su body.
// El body se recorta y se ocultan datos personales sensibles (email, documento, teléfono, tarjeta, tokens).
import { mpGet, type MpResult } from "./mp";
import { computeMpBalance } from "./mp-sync";
import { money } from "./currency";

export type Probe = { key: string; title: string; why: string; endpoint: string; status: number | null; ok: boolean; summary: string; body: string };
type Conn = Parameters<typeof computeMpBalance>[0];
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});

const HIDDEN = /token|secret|password|email|phone|identification|address|card|cvv|first_name|last_name|nickname|ip_address/i;
const MAX_BODY = 2500;

/** Copia recortada del body: oculta claves sensibles, hasta 3 niveles, 2 elementos por lista, textos cortos. */
export function pruneBody(v: unknown, depth = 0): unknown {
  if (v === null || typeof v !== "object") return typeof v === "string" && v.length > 80 ? `${v.slice(0, 80)}…` : v;
  if (depth >= 3) return Array.isArray(v) ? `[${v.length} elementos]` : "{…}";
  if (Array.isArray(v)) {
    const head = v.slice(0, 2).map((x) => pruneBody(x, depth + 1));
    return v.length > 2 ? [...head, `… y ${v.length - 2} más`] : head;
  }
  return Object.fromEntries(Object.entries(v as Obj).map(([k, x]) => [k, HIDDEN.test(k) ? "[oculto]" : pruneBody(x, depth + 1)]));
}

export function bodyText(r: MpResult) {
  if (r.error) return r.error;
  if (r.body === null || r.body === undefined) return "(sin body)";
  const s = JSON.stringify(pruneBody(r.body), null, 2);
  return s.length > MAX_BODY ? `${s.slice(0, MAX_BODY)}\n… (recortado)` : s;
}

const paging = (r: MpResult) => { const b = obj(r.body); const n = Array.isArray(b.results) ? b.results.length : 0; return `Total informado: ${obj(b.paging).total ?? "—"} · devueltos: ${n}`; };

/** Corre las pruebas. `currency` = moneda de la cuenta. */
export async function diagnose(conn: Conn, currency: string): Promise<Probe[]> {
  const me = conn.mpUserId;
  const search = "sort=date_created&criteria=desc&limit=5";
  const calls: [string, string, string, string, (r: MpResult) => string][] = [
    ["me", "Usuario", "Confirma que el token funciona.", "/users/me", (r) => (String(obj(r.body).id) === me ? "Coincide con el usuario vinculado" : "⚠ No coincide con el usuario vinculado")],
    ["payin", "Pagos que cobraste", "Ingresos: suman al saldo.", `/v1/payments/search?${search}&collector.id=${me}`, paging],
    ["payout", "Pagos que hiciste", "Gastos: restan del saldo.", `/v1/payments/search?${search}&payer.id=${me}`, paging],
  ];
  const probes = await Promise.all(calls.map(async ([key, title, why, endpoint, sum]) => {
    const r = await mpGet(conn, endpoint);
    return { key, title, why, endpoint: `GET https://api.mercadopago.com${endpoint}`, status: r.status, ok: r.ok, summary: r.ok ? sum(r) : `Error ${r.status ?? ""}`.trim(), body: bodyText(r) };
  }));

  // Saldo: saldo inicial + pagos aprobados desde ese momento (no hay endpoint oficial de saldo).
  const calc = await computeMpBalance(conn, currency);
  probes.push({
    key: "saldo", title: "Saldo", why: "Saldo inicial que cargaste + pagos aprobados desde entonces. Mercado Pago no tiene un endpoint oficial de saldo.",
    endpoint: `GET https://api.mercadopago.com/v1/payments/search (collector.id y payer.id = ${me}, desde el saldo inicial)`,
    status: calc.ok ? 200 : calc.failed?.status ?? null, ok: calc.ok,
    summary: calc.ok ? `Saldo OK: ${money(calc.balance, currency)} (inicial ${money(calc.base, currency)} ${calc.delta < 0n ? "−" : "+"} ${money(calc.delta < 0n ? -calc.delta : calc.delta, currency)} de ${calc.count} pagos)` : calc.error,
    body: calc.ok ? "" : calc.failed ? bodyText(calc.failed) : "",
  });
  return probes;
}
