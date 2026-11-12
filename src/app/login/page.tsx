import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import Err from "@/components/Err";

async function enter(fd: FormData) {
  "use server";
  const creds = { email: String(fd.get("email")), password: String(fd.get("password")) };
  const sb = await supabaseServer();
  const { error } = fd.get("mode") === "up" ? await sb.auth.signUp(creds) : await sb.auth.signInWithPassword(creds);
  if (error) redirect(`/login?e=${encodeURIComponent(error.message)}`);
  const { data } = await supabaseServer().auth.getUser();
}

export default function Login({ searchParams }: { searchParams: { e?: string } }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <h1 className="text-2xl font-semibold text-primary">Finanzas del hogar</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Ingresá o creá tu cuenta para empezar.</p>
      <Err e={searchParams.e} />
      <form action={enter} className="card space-y-3">
        <input name="email" type="email" required autoComplete="email" placeholder="Correo electrónico" className="input" />
        <input name="password" type="password" required minLength={8} autoComplete="current-password" placeholder="Contraseña (mínimo 8 caracteres)" className="input" />
        <button name="mode" value="in" className="btn w-full">Ingresar</button>
        <button name="mode" value="up" className="w-full rounded-lg border border-line py-2.5 text-sm text-secondary">Crear cuenta</button>
      </form>
    </main>
  );
}
