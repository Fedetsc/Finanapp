"use client";
import { useState } from "react";
import { currencyName } from "@/lib/currency";
import { Avatar, Icon } from "./ui";
import SubmitButton from "./SubmitButton";

type Person = { name: string; memberId: string };

/** Nueva división: título, moneda y personas (arranca con los miembros del hogar; se pueden sacar y sumar nombres libres). */
export default function SplitGroupForm({ members, currencies, action }: { members: Person[]; currencies: string[]; action: (fd: FormData) => void }) {
  const [people, setPeople] = useState<Person[]>(members);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const clean = name.trim();
  const dup = people.some((p) => p.name.localeCompare(clean, "es", { sensitivity: "base" }) === 0);
  const add = () => { if (!clean || dup || clean.length > 40) return; setPeople([...people, { name: clean, memberId: "" }]); setName(""); };

  return (
    <form action={action} className="card space-y-5">
      <label className="block"><span className="label">Título</span>
        <input name="title" required maxLength={60} autoComplete="off" placeholder="Ej. Viaje a Mar del Plata, Asado del sábado" value={title} onChange={(e) => setTitle(e.target.value)} className="input text-lg font-bold" />
      </label>
      {currencies.length > 1 ? (
        <label className="block"><span className="label">Moneda</span>
          <select name="currency" defaultValue="ARS" className="input">{currencies.map((c) => <option key={c} value={c}>{currencyName(c)}</option>)}</select>
        </label>
      ) : <input type="hidden" name="currency" value="ARS" />}

      <fieldset>
        <legend className="label">Personas ({people.length})</legend>
        <ul className="flex flex-wrap gap-2">
          {people.map((p, i) => (
            <li key={p.name} className="inline-flex items-center gap-2 rounded-full bg-bg py-1 pl-1 pr-2 text-sm font-semibold">
              <Avatar name={p.name} size="sm" />{p.name}{p.memberId && <span className="text-[11px] font-normal text-muted">hogar</span>}
              <input type="hidden" name="pname" value={p.name} /><input type="hidden" name="pmember" value={p.memberId} />
              <button type="button" onClick={() => setPeople(people.filter((_, j) => j !== i))} aria-label={`Sacar a ${p.name}`} className="rounded-full p-0.5 text-muted hover:text-neg"><Icon name="x" className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            maxLength={40} autoComplete="off" placeholder="Nombre (ej. Juan, Mamá)" aria-label="Nombre de la persona" className="input" />
          <button type="button" onClick={add} disabled={!clean || dup} className="btn-ghost shrink-0 px-4 disabled:opacity-50"><Icon name="plus" className="h-4 w-4" />Agregar</button>
        </div>
        {dup && <p className="mt-1.5 text-xs text-neg">Ya está en la lista.</p>}
      </fieldset>

      <SubmitButton className="btn w-full" pendingText="Creando..." disabled={people.length < 2 || !title.trim()}>Crear división</SubmitButton>
      {people.length < 2 && <p className="-mt-3 text-center text-xs text-muted">Hacen falta al menos 2 personas.</p>}
    </form>
  );
}
