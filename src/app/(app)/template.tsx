/** Se vuelve a montar en cada cambio de página: la página entra con un fade + slide corto (ver .page-enter en globals.css). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
