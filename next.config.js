/** @type {import('next').NextConfig} */
const withSerwist = require("@serwist/next").default({
  // PWA: src/app/sw.ts se compila a public/sw.js en el build. En desarrollo queda apagado para no cachear nada mientras programás.
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  // Pantalla "Sin conexión" precacheada para mostrar cuando no hay internet.
  additionalPrecacheEntries: [{ url: "/~offline", revision: String(Date.now()) }],
});

// Headers de seguridad básicos. No incluye CSP para no romper los estilos/scripts inline de Next.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

module.exports = withSerwist({
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // El service worker nunca se cachea en el navegador: así cada deploy se toma enseguida.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Content-Type", value: "application/javascript; charset=utf-8" }] },
    ];
  },
});
