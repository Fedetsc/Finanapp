"use client";

import { useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import Err from "@/components/Err";
import PasswordInput from "@/components/PasswordInput";
import AuthShell from "@/components/AuthShell";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [e, setE] = useState("");
  const [loading, setLoading] = useState(false);

  async function enter(ev: React.FormEvent) {
    ev.preventDefault();
    setE("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setE(error.message);
      setLoading(false);
      return;
    }
    // Recarga completa para que el servidor lea las cookies de sesión recién creadas.
    window.location.assign("/");
  }

  return (
    <AuthShell
      icon="home"
      title={<>Las cuentas de casa,<br />más simples juntos</>}
      subtitle="Ingresá para ver los gastos, cuentas y ahorros de tu hogar."
      footer={<>¿No tenés cuenta? <Link href="/register" className="font-semibold text-primary">Creá una</Link></>}
    >
      <Err e={e} />
      <form className="card space-y-3" onSubmit={enter}>
        <input name="email" type="email" required autoComplete="email" placeholder="Correo electrónico" aria-label="Correo electrónico"
          className="input" value={email} onChange={(ev) => setEmail(ev.target.value)} />
        <PasswordInput name="password" required autoComplete="current-password" placeholder="Contraseña" aria-label="Contraseña"
          value={password} onChange={(ev) => setPassword(ev.target.value)} />
        <button type="submit" className="btn w-full py-4 text-base" disabled={loading}>{loading ? "Ingresando..." : "Ingresar"}</button>
      </form>
    </AuthShell>
  );
}
