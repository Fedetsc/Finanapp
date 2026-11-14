"use client";

import { useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import Err from "@/components/Err";
import PasswordInput from "@/components/PasswordInput";
import AuthShell from "@/components/AuthShell";

const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [touched, setTouched] = useState(false);
  const [e, setE] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const errors = {
    email: !EMAIL.test(email.trim()) ? "Ingresá un correo válido" : "",
    password: password.length < 8 ? "La contraseña tiene que tener al menos 8 caracteres" : "",
    repeat: repeat !== password ? "Las contraseñas no coinciden" : "",
  };
  const show = (k: keyof typeof errors) => (touched || (k === "repeat" && repeat.length > 0)) && errors[k];

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setTouched(true);
    setE("");
    setInfo("");
    if (errors.email || errors.password || errors.repeat) return; // no se envía nada
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) {
      setE(error.message);
      setLoading(false);
      return;
    }
    if (!data.session) {
      // Supabase con confirmación de email activada: todavía no hay sesión para ir al onboarding.
      setInfo("Te enviamos un correo para confirmar tu cuenta. Confirmalo y después ingresá.");
      setLoading(false);
      return;
    }
    // Recarga completa para que el servidor lea la sesión nueva. El onboarding pide crear o unirse a un hogar.
    window.location.assign("/onboarding");
  }

  const fieldErr = (msg: string | false, id: string) => (msg ? <p id={id} className="mt-1.5 px-1 text-xs font-medium text-neg">{msg}</p> : null);

  return (
    <AuthShell
      icon="users"
      title="Creá tu cuenta"
      subtitle="Después vas a poder crear tu hogar o unirte al de tu pareja o familia."
      footer={<>¿Ya tenés cuenta? <Link href="/login" className="font-semibold text-primary">Ingresá</Link></>}
    >
      <Err e={e} />
      {info && <p role="status" className="mb-4 rounded-2xl bg-mint-soft px-4 py-3 text-sm text-pos">{info}</p>}
      <form className="card space-y-3" onSubmit={submit} noValidate>
        <div>
          <input name="email" type="email" required autoComplete="email" placeholder="Correo electrónico" aria-label="Correo electrónico" value={email}
            onChange={(ev) => setEmail(ev.target.value)} aria-invalid={!!show("email") || undefined} aria-describedby="err-email"
            className={`input ${show("email") ? "border-neg" : ""}`} />
          {fieldErr(show("email"), "err-email")}
        </div>
        <div>
          <PasswordInput name="password" required minLength={8} autoComplete="new-password" placeholder="Contraseña (mínimo 8 caracteres)"
            value={password} onChange={(ev) => setPassword(ev.target.value)} invalid={!!show("password")} aria-describedby="err-password" aria-label="Contraseña" />
          {fieldErr(show("password"), "err-password")}
        </div>
        <div>
          <PasswordInput name="repeat" required autoComplete="new-password" placeholder="Repetir contraseña"
            value={repeat} onChange={(ev) => setRepeat(ev.target.value)} invalid={!!show("repeat")} aria-describedby="err-repeat" aria-label="Repetir contraseña" />
          {fieldErr(show("repeat"), "err-repeat")}
        </div>
        <button type="submit" className="btn w-full py-4 text-base" disabled={loading}>{loading ? "Creando..." : "Crear cuenta"}</button>
      </form>
    </AuthShell>
  );
}
