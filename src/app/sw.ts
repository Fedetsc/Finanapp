/// <reference lib="webworker" />
// Service worker de Finanapp (lo compila @serwist/next en public/sw.js; en desarrollo está apagado).
// Qué se cachea:
// - JS, CSS, fuentes e íconos del build: precache (cambian de nombre en cada deploy).
// - Inicio ("/"): red primero; si no hay internet, la última versión guardada.
// - Todo lo demás (movimientos, acciones, Supabase, /api): siempre de la red, nunca se guarda.
//   Sin internet, las otras páginas muestran /~offline.
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist, StaleWhileRevalidate } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const PAGES = "finanapp-pages";
const sameOrigin = (url: URL) => url.origin === self.location.origin;

// Al ir a /login u /onboarding (cerrar sesión, sesión vencida, sin hogar) se borra el Inicio guardado:
// así nadie ve offline el resumen de otra persona en el mismo dispositivo.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (sameOrigin(url) && (url.pathname === "/login" || url.pathname === "/onboarding")) event.waitUntil(caches.delete(PAGES));
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Solo la carga completa de Inicio (no las peticiones internas de Next con ?_rsc).
      matcher: ({ request, url }) => request.mode === "navigate" && sameOrigin(url) && url.pathname === "/",
      handler: new NetworkFirst({
        cacheName: PAGES,
        plugins: [
          // Solo se guarda una respuesta buena de Inicio (no un redirect al login).
          { cacheWillUpdate: async ({ response }) => (response.ok && !response.redirected ? response : null) },
          new ExpirationPlugin({ maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 30 }),
        ],
      }),
    },
    {
      // Resto de las páginas: siempre de la red y sin guardar nada (datos frescos).
      // Está como regla para que, sin internet, se muestre /~offline en vez de la pantalla de error del navegador.
      matcher: ({ request, url }) => request.mode === "navigate" && sameOrigin(url),
      handler: new NetworkOnly(),
    },
    {
      matcher: ({ url }) => sameOrigin(url) && url.pathname.startsWith("/icons/"),
      handler: new CacheFirst({ cacheName: "finanapp-icons", plugins: [new ExpirationPlugin({ maxEntries: 20 })] }),
    },
    {
      matcher: ({ url }) => sameOrigin(url) && url.pathname === "/manifest.json",
      handler: new StaleWhileRevalidate({ cacheName: "finanapp-manifest" }),
    },
  ],
  fallbacks: {
    // Sin internet, cualquier página que no esté guardada muestra la pantalla "Sin conexión".
    entries: [{ url: "/~offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();
