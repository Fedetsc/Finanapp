export default function Err({ e }: { e?: string }) {
  return e ? <p role="alert" className="mb-4 rounded-2xl bg-[#FDECEE] px-4 py-3 text-sm font-medium text-neg">{e}</p> : null;
}
