import type { MutableRefObject } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { apiFetch } from '@/lib/api'
import { messageFromApiErrorPayload } from '@/lib/http-error-message'

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length) as Uint8Array<ArrayBuffer>
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

function isStandaloneDisplayMode(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isIosFamily(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent ?? ''
  return /iPad|iPhone|iPod/.test(ua) || (
    navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  )
}

function getPushSupportState(): {
  isSupported: boolean
  supportMessage: string | null
  requiresStandaloneInstall: boolean
} {
  if (typeof window === 'undefined') {
    return { isSupported: false, supportMessage: null, requiresStandaloneInstall: false }
  }
  if (!window.isSecureContext) {
    return {
      isSupported: false,
      supportMessage: 'Push notifications need HTTPS or localhost.',
      requiresStandaloneInstall: false,
    }
  }
  const hasBaseApis =
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  if (hasBaseApis) {
    return { isSupported: true, supportMessage: null, requiresStandaloneInstall: false }
  }
  if (isIosFamily() && !isStandaloneDisplayMode()) {
    return {
      isSupported: false,
      supportMessage:
        'On iPhone and iPad, install Myle to your Home Screen first. Then open the app there and enable notifications.',
      requiresStandaloneInstall: true,
    }
  }
  return {
    isSupported: false,
    supportMessage: 'Push notifications are not available in this browser.',
    requiresStandaloneInstall: false,
  }
}

type VapidConfigResponse = {
  public_key?: string
  publicKey?: string
  enabled?: boolean
  detail?: string | null
}

async function readJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function ensurePushServiceWorkerReady(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration()
  if (!existing) {
    await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    })
  }
  return navigator.serviceWorker.ready
}

function describePushError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.trim()) return error.message.trim()
    if (error.name === 'NotAllowedError') {
      return 'Notifications were blocked. Allow them in browser or app settings, then try again.'
    }
    if (error.name === 'AbortError') {
      return 'Notification setup was interrupted. Please try again.'
    }
    if (error.name === 'InvalidStateError') {
      return 'This device had an old notification registration. Try again to reconnect it.'
    }
  }
  return 'Notifications could not be enabled on this device right now.'
}

async function getVapidKey(
  vapidKeyRef: MutableRefObject<Uint8Array<ArrayBuffer> | null>,
): Promise<Uint8Array<ArrayBuffer>> {
  if (vapidKeyRef.current) return vapidKeyRef.current

  const response = await apiFetch('/api/v1/notifications/vapid-key')
  const body = (await readJsonSafe(response)) as VapidConfigResponse | null
  if (!response.ok) {
    throw new Error(
      messageFromApiErrorPayload(body, `Notification setup failed (HTTP ${response.status})`),
    )
  }

  const publicKey =
    (typeof body?.public_key === 'string' && body.public_key.trim()) ||
    (typeof body?.publicKey === 'string' && body.publicKey.trim()) ||
    ''

  if (body?.enabled === false || !publicKey) {
    throw new Error(
      typeof body?.detail === 'string' && body.detail.trim()
        ? body.detail.trim()
        : 'Push delivery is not configured on the server yet.',
    )
  }

  const vapidKey = urlBase64ToUint8Array(publicKey)
  vapidKeyRef.current = vapidKey
  return vapidKey
}

async function persistPushSubscription(pushSub: PushSubscription): Promise<void> {
  const json = pushSub.toJSON()
  const response = await apiFetch('/api/v1/notifications/subscribe', {
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
  if (!response.ok) {
    const body = await readJsonSafe(response)
    throw new Error(
      messageFromApiErrorPayload(
        body,
        `Notification registration failed (HTTP ${response.status})`,
      ),
    )
  }
}

async function clearPushSubscription(endpoint?: string | null): Promise<void> {
  const response = await apiFetch('/api/v1/notifications/unsubscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      endpoint
        ? { endpoint }
        : { clear_all: true },
    ),
  })
  if (!response.ok && response.status !== 404) {
    const body = await readJsonSafe(response)
    throw new Error(
      messageFromApiErrorPayload(
        body,
        `Notification cleanup failed (HTTP ${response.status})`,
      ),
    )
  }
}

async function createOrReuseSubscription(
  registration: ServiceWorkerRegistration,
  vapidKeyRef: MutableRefObject<Uint8Array<ArrayBuffer> | null>,
): Promise<PushSubscription> {
  const existing = await registration.pushManager.getSubscription()
  if (existing) return existing

  const vapidKey = await getVapidKey(vapidKeyRef)
  try {
    return await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKey,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'InvalidStateError') {
      const stale = await registration.pushManager.getSubscription()
      if (stale) {
        await stale.unsubscribe().catch(() => undefined)
      }
      return registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey,
      })
    }
    throw error
  }
}

export async function requestPushPermissionFromGesture(): Promise<NotificationPermission | null> {
  const support = getPushSupportState()
  if (!support.isSupported) return null
  try {
    if (Notification.permission === 'default') {
      return await Notification.requestPermission()
    }
    return Notification.permission
  } catch {
    return Notification.permission
  }
}

export async function syncPushSubscriptionSilently(): Promise<boolean> {
  const support = getPushSupportState()
  if (!support.isSupported) return false
  if (Notification.permission !== 'granted') return false

  const vapidKeyRef = {
    current: null as Uint8Array<ArrayBuffer> | null,
  } as MutableRefObject<Uint8Array<ArrayBuffer> | null>
  const registration = await ensurePushServiceWorkerReady()
  const pushSub = await createOrReuseSubscription(registration, vapidKeyRef)
  await persistPushSubscription(pushSub)
  return true
}

export function usePushNotifications() {
  const support = useMemo(() => getPushSupportState(), [])
  const [permission, setPermission] = useState<NotificationPermission>(
    support.isSupported ? Notification.permission : 'denied',
  )
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const vapidKeyRef = useRef<Uint8Array<ArrayBuffer> | null>(null)

  const refresh = useCallback(async (silent = false): Promise<void> => {
    if (!support.isSupported) {
      setIsSubscribed(false)
      return
    }
    setPermission(Notification.permission)
    if (Notification.permission !== 'granted') {
      setIsSubscribed(false)
      if (!silent) setErrorMessage(null)
      return
    }

    try {
      const registration = await ensurePushServiceWorkerReady()
      const pushSub = await registration.pushManager.getSubscription()
      if (!pushSub) {
        setIsSubscribed(false)
        if (!silent) setErrorMessage(null)
        return
      }
      await persistPushSubscription(pushSub)
      setIsSubscribed(true)
      setErrorMessage(null)
    } catch (error) {
      setIsSubscribed(false)
      if (!silent) {
        setErrorMessage(describePushError(error))
      }
    }
  }, [support.isSupported])

  useEffect(() => {
    if (!support.isSupported) return undefined

    let cancelled = false
    void refresh(true).finally(() => {
      if (!cancelled) {
        setPermission(Notification.permission)
      }
    })

    const handleFocus = () => {
      void refresh(true)
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refresh(true)
      }
    }
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [refresh, support.isSupported])

  const subscribe = useCallback(async (): Promise<void> => {
    if (!support.isSupported) {
      setErrorMessage(support.supportMessage ?? 'Push notifications are not available here.')
      return
    }
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const nextPermission = await Notification.requestPermission()
      setPermission(nextPermission)
      if (nextPermission !== 'granted') {
        setIsSubscribed(false)
        setErrorMessage('Notifications were not allowed. Enable them in browser or app settings to receive alerts.')
        return
      }

      const registration = await ensurePushServiceWorkerReady()
      const pushSub = await createOrReuseSubscription(registration, vapidKeyRef)
      await persistPushSubscription(pushSub)
      setIsSubscribed(true)
      setErrorMessage(null)
    } catch (error) {
      setIsSubscribed(false)
      setErrorMessage(describePushError(error))
    } finally {
      setIsLoading(false)
    }
  }, [support.isSupported, support.supportMessage])

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!support.isSupported) return
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const registration = await ensurePushServiceWorkerReady()
      const pushSub = await registration.pushManager.getSubscription()
      const endpoint = pushSub?.endpoint ?? null
      if (pushSub) {
        await pushSub.unsubscribe().catch(() => undefined)
      }
      await clearPushSubscription(endpoint)
      setIsSubscribed(false)
    } catch (error) {
      setErrorMessage(describePushError(error))
    } finally {
      setIsLoading(false)
    }
  }, [support.isSupported])

  return {
    isSupported: support.isSupported,
    permission,
    isSubscribed,
    isLoading,
    errorMessage,
    supportMessage: support.supportMessage,
    requiresStandaloneInstall: support.requiresStandaloneInstall,
    subscribe,
    unsubscribe,
    refresh,
  }
}
