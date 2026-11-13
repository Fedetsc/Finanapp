"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import Err from "@/components/Err";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [e, setE] = useState("");
  const [loading, setLoading] = useState(false);

  const [info, setInfo] = useState("");

  async function enter(mode: "in" | "up") {
    setE("");
    setInfo("");
    setLoading(true);
    const creds = { email, password };
    const { data, error } = mode === "up"
      ? await supabase.auth.signUp(creds)
      : await supabase.auth.signInWithPassword(creds);

    if (error) {
      setE(error.message);
      setLoading(false);
      return;
    }
    if (!data.session) {
      // Supabase con confirmación de email activada: todavía no hay sesión.
      setInfo("Te enviamos un correo para confirmar tu cuenta. Confirmalo y después ingresá.");
      setLoading(false);
      return;
    }
    // Recarga completa para que el servidor lea las cookies de sesión recién creadas.
    window.location.assign("/");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <h1 className="text-2xl font-semibold text-primary">Finanzas del hogar</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Ingresá o creá tu cuenta para empezar.</p>
      <Err e={e} />
      {info && <p className="mb-3 rounded-lg border border-pos/40 bg-pos/10 p-3 text-sm text-pos">{info}</p>}
      <form
        className="card space-y-3"
        onSubmit={(ev) => {
          ev.preventDefault();
          enter("in");
        }}
      >
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="Correo electrónico"
          className="input"
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
        />
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="current-password"
          placeholder="Contraseña (mínimo 8 caracteres)"
          className="input"
          value={password}
          onChange={(ev) => setPassword(ev.target.value)}
        />
        <button type="submit" className="btn w-full" disabled={loading}>
          {loading ? "Ingresando..." : "Ingresar"}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={(ev) => {
            if (ev.currentTarget.form?.reportValidity()) enter("up");
          }}
          className="w-full rounded-lg border border-line py-2.5 text-sm text-secondary"
        >
          Crear cuenta
        </button>
      </form>
    </main>
  );
}
