// Monto ya guardado que se puede ocultar con el ojito. Sin "use client": sirve en server y client.
// Renderiza el valor y la máscara; el CSS (globals.css, [data-hide-amounts]) muestra uno u otro.
import { currencySymbol } from "@/lib/currency";

export const MASK = "••••••";

/** `c`: moneda para conservar el símbolo ("$ ••••••", "US$ MEP ••••••"). `mask` reemplaza la máscara entera. */
export default function Amt({ children, c = "ARS", mask }: { children: React.ReactNode; c?: string; mask?: string }) {
  return (
    <>
      <span className="amt-v">{children}</span>
      <span className="amt-m">{mask ?? `${currencySymbol(c)} ${MASK}`}</span>
    </>
  );
}
