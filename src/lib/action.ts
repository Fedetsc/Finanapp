import { redirect } from "next/navigation";
import { ZodError } from "zod";

/** Vuelve a la página con un mensaje de error legible. */
export function fail(path: string, e: unknown): never {
  const msg = e instanceof Error && !(e instanceof ZodError) ? e.message : "Revisá los datos ingresados";
  redirect(`${path}?e=${encodeURIComponent(msg)}`);
}
