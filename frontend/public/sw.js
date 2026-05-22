/* Myle SW — PWA install + Web Push + Offline caching */
const CACHE_PREFIX = 'myle-v20260521-2'
const STATIC_CACHE = `${CACHE_PREFIX}-static`
const API_CACHE = `${CACHE_PREFIX}-api`

// ── Helpers ───────────────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

function normalizeNotificationUrl(rawUrl) {
  try {
    return new URL(rawUrl || '/dashboard', self.location.origin).toString()
  } catch {
    return new URL('/dashboard', self.location.origin).toString()
  }
}

// ── Install / Activate ────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(CACHE_PREFIX))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim())
      .then(() => {
        self.clients
          .matchAll({ type: 'window', includeUncontrolled: true })
          .then((list) => list.forEach((c) => c.postMessage({ type: 'SW_UPDATED' })))
      }),
  )
})

// ── Offline caching ───────────────────────────────────────────────────────────

// API GET routes that are safe to serve from cache when offline.
const API_CACHE_PATHS = [
  '/api/v1/leads',
  '/api/v1/follow-ups',
  '/api/v1/workboard',
  '/api/v1/checkin/today',
  '/api/v1/hello',
  '/api/v1/auth/me',
  '/api/v1/team/tracking',
  '/api/v1/retarget',
]

function matchesApiCache(url) {
  return API_CACHE_PATHS.some((p) => url.pathname.startsWith(p))
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/assets/') ||
    /\.(png|svg|ico|webmanifest|woff2?|ttf|mp3)$/.test(url.pathname)
  )
}

/**
 * Stale-while-revalidate — serve cached instantly, update cache in background.
 * Falls back to a 503 JSON when truly offline and no cache exists.
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => null)

  if (cached) {
    // Serve cached immediately; let network update run in background.
    networkPromise.catch(() => {})
    return cached
  }
  return (await networkPromise) ?? new Response(
    JSON.stringify({ offline: true, cached: false }),
    { status: 503, headers: { 'Content-Type': 'application/json' } },
  )
}

/**
 * Cache-first — ideal for hashed static assets that never change at the same URL.
 */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response && response.ok) cache.put(request, response.clone())
  return response
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  // Only handle same-origin GETs.
  if (request.method !== 'GET') return
  let url
  try { url = new URL(request.url) } catch { return }
  if (url.origin !== self.location.origin) return
  // Skip WebSocket upgrades.
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return

  if (matchesApiCache(url)) {
    event.respondWith(staleWhileRevalidate(request, API_CACHE))
    return
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE))
  }
  // HTML navigation: let browser handle normally (network-first by default).
})

// ── SW message channel ────────────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// ── Web Push ──────────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data?.json() ?? {} } catch { data = { title: 'Myle', body: event.data?.text() ?? '' } }
  const title = data.title ?? 'Myle Community'
  const tag = data.tag ?? `myle-notification-${Date.now()}`
  const options = {
    body: data.body ?? '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag,
    data: { url: normalizeNotificationUrl(data.url) },
    vibrate: [200, 100, 200],
    requireInteraction: true,
    renotify: true,
    timestamp: typeof data.timestamp === 'number' ? data.timestamp : Date.now(),
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = normalizeNotificationUrl(event.notification.data?.url)
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return clients.openWindow(url)
    }),
  )
})

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      const vapidResponse = await fetch('/api/v1/notifications/vapid-key', { credentials: 'include' })
      const body = await vapidResponse.json().catch(() => ({}))
      const publicKey = body.public_key || body.publicKey || ''
      if (!vapidResponse.ok || body.enabled === false || !publicKey) return
      const subscription = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
      const json = subscription.toJSON()
      await fetch('/api/v1/notifications/subscribe', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
        }),
      })
    } catch {
      // Best effort — foreground sync will retry.
    }
  })())
})
