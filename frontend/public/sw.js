/* PWA service worker — offline caching + Web Push notifications */
const CACHE_NAME = 'myle-vl2-v20260512'
const STATIC_ASSETS = [/\.js$/, /\.css$/, /\.woff2?$/, /\.png$/, /\.svg$/, /\.ico$/, /\.webp$/]
const ASSET_CACHE_MAX = 200

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

function isStaticAsset(url) {
  return STATIC_ASSETS.some((rx) => rx.test(url))
}

function isApiRequest(url) {
  return url.includes('/api/')
}

/* ── Install — pre-cache nothing (cache on first use) ─────────────────── */
self.addEventListener('install', () => {
  self.skipWaiting()
})

/* ── Activate — clean old caches ──────────────────────────────────────── */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
    .then(() => {
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
        list.forEach((client) => client.postMessage({ type: 'SW_UPDATED' }))
      })
    })
  )
})

/* ── Fetch — cache-first for static, network-first for nav/API ───────── */
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== 'GET') return

  // Cache-first for static assets (JS, CSS, fonts, images)
  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          const fetchPromise = fetch(request).then((response) => {
            if (response.ok) {
              event.waitUntil(cache.put(request, response.clone()))
            }
            return response
          }).catch(() => cached)
          return cached || fetchPromise
        })
      )
    )
    return
  }

  // Network-first for navigations & API (show stale if offline)
  if (request.mode === 'navigate' || isApiRequest(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && request.mode === 'navigate') {
            const clone = response.clone()
            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
            )
          }
          return response
        })
        .catch(() => caches.match(request))
    )
    return
  }

  // Default: network-first
  event.respondWith(fetch(request).catch(() => caches.match(request)))
})

/* ── Compact asset cache ──────────────────────────────────────────────── */
async function trimAssetCache() {
  const cache = await caches.open(CACHE_NAME)
  const keys = await cache.keys()
  if (keys.length > ASSET_CACHE_MAX) {
    const toDelete = keys.slice(0, keys.length - ASSET_CACHE_MAX)
    await Promise.all(toDelete.map((k) => cache.delete(k)))
  }
}

/* ── Message handler ──────────────────────────────────────────────────── */
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

/* ── Push notifications ───────────────────────────────────────────────── */
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
    })
  )
})

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      const vapidResponse = await fetch('/api/v1/notifications/vapid-key', {
        credentials: 'include',
      })
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
          keys: {
            p256dh: json.keys?.p256dh ?? '',
            auth: json.keys?.auth ?? '',
          },
        }),
      })
    } catch {
      // Best effort — foreground sync path will retry later.
    }
  })())
})
