// Pantalla estática que el service worker muestra cuando no hay internet y la página pedida no está guardada.
export const metadata = { title: "Sin conexión · Finanapp" };

export default function Offline() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-xl font-extrabold text-white">FH</span>
      <h1 className="text-xl font-bold">Sin conexión</h1>
      <p className="max-w-xs text-sm text-muted">Esta pantalla necesita internet. Podés ver el último resumen guardado de Inicio; cuando vuelva la conexión se actualiza solo.</p>
      <a href="/" className="btn">Ir a Inicio</a>
    </main>
  );
}
