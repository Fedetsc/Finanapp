import "./globals.css";
import { Plus_Jakarta_Sans } from "next/font/google";

// Antes de pintar: si este dispositivo tenía los montos ocultos, se ocultan sin parpadeo (ver HideAmounts.tsx).
const HIDE_SCRIPT = `try{if(localStorage.getItem("finanapp_hide_amounts")==="1")document.documentElement.setAttribute("data-hide-amounts","")}catch(e){}`;

const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans" });
export const metadata = { title: "Finanapp", description: "Las cuentas de casa, más simples juntos" };
export const viewport = { themeColor: "#F5F6F8" };

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={sans.variable} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: HIDE_SCRIPT }} /></head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
