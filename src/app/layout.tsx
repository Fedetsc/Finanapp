import "./globals.css";
import { Plus_Jakarta_Sans } from "next/font/google";

const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans" });
export const metadata = { title: "Finanapp", description: "Las cuentas de casa, más simples juntos" };
export const viewport = { themeColor: "#F5F6F8" };

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={sans.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
