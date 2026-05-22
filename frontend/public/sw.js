/* Minimal SW — PWA install + Web Push notifications */
const CACHE_VERSION = 'myle-v20260425-1'

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

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
    .then(() => {
      // Tell all open tabs to reload
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
        list.forEach((client) => client.postMessage({ type: 'SW_UPDATED' }))
      })
    })
  )
})
self.addEventListener('fetch', () => {})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

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
      // Best effort only — foreground sync path will retry later.
    }
  })())
})
