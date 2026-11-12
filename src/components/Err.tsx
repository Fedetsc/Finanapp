export default function Err({ e }: { e?: string }) {
  return e ? <p role="alert" className="mb-3 rounded-lg border border-neg/40 bg-neg/10 p-3 text-sm text-neg">{e}</p> : null;
}
