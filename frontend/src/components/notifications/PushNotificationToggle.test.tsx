import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PushNotificationToggle } from '@/components/notifications/PushNotificationToggle'

type NotificationLike = {
  permission: NotificationPermission
  requestPermission: ReturnType<typeof vi.fn<() => Promise<NotificationPermission>>>
}

describe('PushNotificationToggle', () => {
  const fetchMock = vi.fn<typeof fetch>()
  const getSubscriptionMock = vi.fn()
  const subscribeMock = vi.fn()
  const registerMock = vi.fn()
  const requestPermissionMock = vi.fn<() => Promise<NotificationPermission>>()

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

    const notification: NotificationLike = {
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
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('subscribes successfully when the server returns snake_case vapid data', async () => {
    const pushSub = {
      endpoint: 'https://push.example/sub-1',
      toJSON: () => ({
        keys: {
          p256dh: 'p256dh-key',
          auth: 'auth-key',
        },
      }),
      unsubscribe: vi.fn().mockResolvedValue(true),
    } as unknown as PushSubscription

    requestPermissionMock.mockResolvedValue('granted')
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

    render(<PushNotificationToggle />)
    fireEvent.click(screen.getByRole('button', { name: /enable push notifications/i }))

    await waitFor(() => {
      expect(screen.getByText('This device is connected for alerts')).toBeInTheDocument()
    })

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

  it('shows the server setup error instead of failing silently', async () => {
    requestPermissionMock.mockResolvedValue('granted')
    getSubscriptionMock.mockResolvedValue(null)
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          public_key: '',
          enabled: false,
          detail: 'Push delivery is not configured on the server yet.',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )

    render(<PushNotificationToggle />)
    fireEvent.click(screen.getByRole('button', { name: /enable push notifications/i }))

    await waitFor(() => {
      expect(
        screen.getByText('Push delivery is not configured on the server yet.'),
      ).toBeInTheDocument()
    })
  })
})
