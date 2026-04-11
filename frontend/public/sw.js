/* Minimal SW — enables Chrome install + standalone; no offline cache. */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

/* Required for installability on some Chrome builds */
self.addEventListener('fetch', () => {})
