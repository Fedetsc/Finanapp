import "./globals.css";
import { Plus_Jakarta_Sans } from "next/font/google";

// Antes de pintar: si este dispositivo tenía los montos ocultos, se ocultan sin parpadeo (ver HideAmounts.tsx).
const HIDE_SCRIPT = `try{if(localStorage.getItem("finanapp_hide_amounts")==="1")document.documentElement.setAttribute("data-hide-amounts","")}catch(e){}`;

// Tema: el guardado en este dispositivo o, si no hay, el del sistema (ver Theme.tsx). Antes de pintar, sin parpadeo.
const THEME_SCRIPT = `try{var t=localStorage.getItem("finanapp_theme");if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;

const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans" });
export const metadata = {
  title: "Finanapp",
  description: "Las cuentas de casa, más simples juntos",
  applicationName: "Finanzas del Hogar",
  // PWA: manifest (public/manifest.json) e íconos FH (generados con scripts/generate-icons.mjs).
  manifest: "/manifest.json",
  icons: { icon: [{ url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/icons/apple-touch-icon.png" },
  // iPhone: abre a pantalla completa (sin barra de Safari) con el nombre corto debajo del ícono.
  appleWebApp: { capable: true, title: "Finanzas Hogar", statusBarStyle: "default" as const },
  formatDetection: { telephone: false },
  other: { "mobile-web-app-capable": "yes" },
};
export const viewport = { themeColor: "#2D4A63", width: "device-width", initialScale: 1, viewportFit: "cover" as const };

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={sans.variable} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: HIDE_SCRIPT + THEME_SCRIPT }} /></head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
