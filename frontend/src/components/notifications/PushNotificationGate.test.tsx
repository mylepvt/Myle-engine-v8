import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PushNotificationGate } from './PushNotificationGate'

const push = {
  isSupported: true,
  permission: 'default' as NotificationPermission,
  isSubscribed: false,
  isLoading: false,
  errorMessage: null as string | null,
  requiresStandaloneInstall: false,
  subscribe: vi.fn(),
}
vi.mock('@/hooks/use-push-notifications', () => ({ usePushNotifications: () => push }))
let platform: 'ios' | 'android' | 'desktop' = 'android'
vi.mock('@/hooks/use-report-device-status', () => ({
  useReportDeviceStatus: vi.fn(),
  devicePlatform: () => platform,
}))

afterEach(() => {
  cleanup()
  push.errorMessage = null
  push.permission = 'default'
  platform = 'android'
})

describe('PushNotificationGate', () => {
  it('team cannot skip turning notifications on', async () => {
    render(<PushNotificationGate allowSkip={false}><div>app</div></PushNotificationGate>)
    await waitFor(() => expect(screen.getByText('Enable notifications')).toBeInTheDocument(), { timeout: 2000 })
    expect(screen.queryByText(/Skip for now|Continue for now/)).toBeNull()
    expect(screen.queryByText('app')).toBeNull()
  })

  it('a technical failure (not a refusal) still lets them through', async () => {
    push.errorMessage = 'Push service unavailable'
    render(<PushNotificationGate allowSkip={false}><div>app</div></PushNotificationGate>)
    await waitFor(() => expect(screen.getByText('Having trouble? Continue for now')).toBeInTheDocument(), { timeout: 2000 })
  })

  it('blocked notifications keep the screen with no way around', async () => {
    push.permission = 'denied'
    push.errorMessage = 'Notifications were not allowed.'
    render(<PushNotificationGate allowSkip={false}><div>app</div></PushNotificationGate>)
    await waitFor(() => expect(screen.getByText('Notifications blocked')).toBeInTheDocument(), { timeout: 2000 })
    expect(screen.queryByText(/Continue for now|Skip for now/)).toBeNull()
  })

  it('team on a desktop browser can skip, even when notifications are blocked', async () => {
    platform = 'desktop'
    push.permission = 'denied'
    render(<PushNotificationGate allowSkip={false}><div>app</div></PushNotificationGate>)
    await waitFor(() => expect(screen.getByText('Skip for now')).toBeInTheDocument(), { timeout: 2000 })
  })

  it('admins can skip', async () => {
    render(<PushNotificationGate><div>app</div></PushNotificationGate>)
    await waitFor(() => expect(screen.getByText('Skip for now')).toBeInTheDocument(), { timeout: 2000 })
  })
})
