/* Minimal service worker — no offline cache (Vite 8 + vite-plugin-pwa gap). Registers installability only. */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})
