import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

/** Errores de la base: su mensaje trae detalles internos de la consulta y no se muestra al usuario. */
const isDbError = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError ||
  e instanceof Prisma.PrismaClientUnknownRequestError ||
  e instanceof Prisma.PrismaClientValidationError ||
  e instanceof Prisma.PrismaClientInitializationError ||
  e instanceof Prisma.PrismaClientRustPanicError;

/** Vuelve a la página con un mensaje de error legible. */
export function fail(path: string, e: unknown): never {
  let msg = "Revisá los datos ingresados";
  if (isDbError(e)) {
    console.error("[action]", path, e instanceof Error ? e.message : e); // queda en los logs del servidor, no en pantalla
    msg = "No se pudo guardar. Probá de nuevo en un momento.";
  } else if (e instanceof Error && !(e instanceof ZodError)) {
    msg = e.message;
  }
  redirect(`${path}?e=${encodeURIComponent(msg)}`);
}
