import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  requestPushPermissionFromGesture,
  syncPushSubscriptionSilently,
} from '@/hooks/use-push-notifications'

type NotificationLike = {
  permission: NotificationPermission
  requestPermission: ReturnType<typeof vi.fn<() => Promise<NotificationPermission>>>
}

describe('push notification helpers', () => {
  const fetchMock = vi.fn<typeof fetch>()
  const getSubscriptionMock = vi.fn()
  const subscribeMock = vi.fn()
  const registerMock = vi.fn()
  const requestPermissionMock = vi.fn<() => Promise<NotificationPermission>>()
  let notification: NotificationLike

  beforeEach(() => {
    fetchMock.mockReset()
    getSubscriptionMock.mockReset()
    subscribeMock.mockReset()
    registerMock.mockReset()
    requestPermissionMock.mockReset()

    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('PushManager', function PushManager() {})

    Object.defineProperty(window, 'isSecureContext', {
      value: true,
      configurable: true,
    })
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
      configurable: true,
    })

    notification = {
      permission: 'default',
      requestPermission: requestPermissionMock,
    }
    Object.defineProperty(window, 'Notification', {
      value: notification,
      configurable: true,
    })

    const registration = {
      pushManager: {
        getSubscription: getSubscriptionMock,
        subscribe: subscribeMock,
      },
    } as unknown as ServiceWorkerRegistration

    Object.defineProperty(window.navigator, 'serviceWorker', {
      value: {
        getRegistration: vi.fn().mockResolvedValue(registration),
        register: registerMock.mockResolvedValue(registration),
        ready: Promise.resolve(registration),
      },
      configurable: true,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('silently recreates and persists a granted subscription after login', async () => {
    const pushSub = {
      endpoint: 'https://push.example/sub-2',
      toJSON: () => ({
        keys: {
          p256dh: 'p256dh-key',
          auth: 'auth-key',
        },
      }),
    } as unknown as PushSubscription

    notification.permission = 'granted'
    getSubscriptionMock.mockResolvedValue(null)
    subscribeMock.mockResolvedValue(pushSub)
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            public_key: 'AQID',
            enabled: true,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, created: true }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

    await expect(syncPushSubscriptionSilently()).resolves.toBe(true)
    expect(subscribeMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:8000/api/v1/notifications/vapid-key',
      expect.objectContaining({ credentials: 'include' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8000/api/v1/notifications/subscribe',
      expect.objectContaining({
        credentials: 'include',
        method: 'POST',
      }),
    )
  })

  it('requests permission while the login click still has user activation', async () => {
    requestPermissionMock.mockImplementation(async () => {
      notification.permission = 'granted'
      return 'granted'
    })

    await expect(requestPushPermissionFromGesture()).resolves.toBe('granted')
    expect(requestPermissionMock).toHaveBeenCalledOnce()
  })
})
