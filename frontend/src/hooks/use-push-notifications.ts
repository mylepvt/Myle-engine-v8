import { useState, useEffect, useCallback, useRef } from 'react'
import { apiFetch } from '@/lib/api'

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length) as Uint8Array<ArrayBuffer>
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

const isSupported =
  typeof window !== 'undefined' &&
  'Notification' in window &&
  'serviceWorker' in navigator &&
  'PushManager' in window

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    isSupported ? Notification.permission : 'denied'
  )
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const vapidKeyRef = useRef<Uint8Array<ArrayBuffer> | null>(null)

  const getVapidKey = useCallback(async (): Promise<Uint8Array<ArrayBuffer> | null> => {
    if (vapidKeyRef.current) return vapidKeyRef.current
    try {
      const res = await apiFetch('/api/v1/notifications/vapid-key')
      const { publicKey } = await res.json()
      const key = urlBase64ToUint8Array(publicKey)
      vapidKeyRef.current = key
      return key
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    if (!isSupported) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiFetch('/api/v1/notifications/status')
        const { subscribed } = await res.json()
        if (!cancelled) setIsSubscribed(!!subscribed)
      } catch {
        /* silent — push is optional */
      }
    })()
    return () => { cancelled = true }
  }, [])

  const subscribe = useCallback(async (): Promise<void> => {
    if (!isSupported) return
    setIsLoading(true)
    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') return

      const vapidKey = await getVapidKey()
      if (!vapidKey) return

      const reg = await navigator.serviceWorker.ready
      const pushSub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey,
      })

      const json = pushSub.toJSON()
      await apiFetch('/api/v1/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: pushSub.endpoint,
          keys: {
            p256dh: json.keys?.p256dh ?? '',
            auth: json.keys?.auth ?? '',
          },
        }),
      })
      setIsSubscribed(true)
    } catch {
      /* silent — push is optional */
    } finally {
      setIsLoading(false)
    }
  }, [getVapidKey])

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!isSupported) return
    setIsLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const pushSub = await reg.pushManager.getSubscription()
      if (pushSub) {
        await pushSub.unsubscribe()
        await apiFetch('/api/v1/notifications/unsubscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: pushSub.endpoint }),
        })
      }
      setIsSubscribed(false)
    } catch {
      /* silent — push is optional */
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { isSupported, permission, isSubscribed, isLoading, subscribe, unsubscribe }
}
