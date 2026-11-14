import Link from "next/link";
import { switchHousehold } from "@/lib/household-actions";
import { roleLabel } from "@/lib/session";
import { Icon, IconTile } from "./ui";

type Membership = { householdId: string; role: string; household: { name: string } };

/** Lista de hogares del usuario con el actual marcado; elegir otro llama a switchHousehold. */
export default function HouseholdSwitcher({ currentId, all, compact = false }: { currentId: string; all: Membership[]; compact?: boolean }) {
  return (
    <div className="space-y-1">
      <ul className="space-y-1">
        {all.map((h) => {
          const current = h.householdId === currentId;
          return (
            <li key={h.householdId}>
              <form action={switchHousehold}>
                <input type="hidden" name="householdId" value={h.householdId} />
                <button disabled={current} aria-current={current ? "true" : undefined}
                  className={`flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left text-sm transition ${current ? "bg-mint-soft font-semibold" : "hover:bg-bg"}`}>
                  {!compact && <IconTile icon="home" tone={current ? "navy" : "gray"} size="sm" />}
                  <span className="min-w-0 flex-1 truncate">{h.household.name}</span>
                  <span className="shrink-0 text-xs text-muted">{roleLabel(h.role)}</span>
                  <span className="w-4 text-pos" aria-hidden="true">{current ? <Icon name="check" className="h-4 w-4" strokeWidth={2.6} /> : null}</span>
                </button>
              </form>
            </li>
          );
        })}
      </ul>
      <Link href="/onboarding" className="flex items-center gap-2 rounded-2xl px-2.5 py-2 text-sm font-semibold text-primary hover:bg-bg">
        <Icon name="plus" className="h-4 w-4" />Crear o unirme a otro hogar
      </Link>
    </div>
  );
}
