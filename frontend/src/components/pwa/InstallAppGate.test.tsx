import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { InstallAppGate } from '@/components/pwa/InstallAppGate'

function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn().mockReturnValue({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
    configurable: true,
  })
}

function stubUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: ua,
    configurable: true,
  })
}

const DESKTOP_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36'

describe('InstallAppGate', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders children immediately when already running standalone', () => {
    stubUserAgent(DESKTOP_UA)
    stubMatchMedia(true)

    render(
      <InstallAppGate>
        <div>dashboard content</div>
      </InstallAppGate>,
    )

    expect(screen.getByText('dashboard content')).toBeInTheDocument()
  })

  it('blocks with an install screen when beforeinstallprompt is available, with no skip option', async () => {
    stubUserAgent(DESKTOP_UA)
    stubMatchMedia(false)
    const promptMock = vi.fn().mockResolvedValue(undefined)
    const userChoice = Promise.resolve({ outcome: 'dismissed' as const })

    render(
      <InstallAppGate>
        <div>dashboard content</div>
      </InstallAppGate>,
    )

    fireEvent(
      window,
      Object.assign(new Event('beforeinstallprompt'), {
        prompt: promptMock,
        userChoice,
      }),
    )

    vi.advanceTimersByTime(1500)

    await waitFor(() => {
      expect(screen.getByText('Install Myle to continue')).toBeInTheDocument()
    })
    expect(screen.queryByText('dashboard content')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /skip|continue without|later/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /install myle/i }))

    await waitFor(() => {
      expect(screen.getByText('Install required')).toBeInTheDocument()
    })
    expect(screen.queryByText('dashboard content')).not.toBeInTheDocument()
  })

  it('lets desktop users through when the browser does not support install prompts at all', async () => {
    stubUserAgent(DESKTOP_UA)
    stubMatchMedia(false)

    render(
      <InstallAppGate>
        <div>dashboard content</div>
      </InstallAppGate>,
    )

    vi.advanceTimersByTime(1500)

    await waitFor(() => {
      expect(screen.getByText('dashboard content')).toBeInTheDocument()
    })
  })

  it('forces Android users through manual install instructions even without a native prompt', async () => {
    stubUserAgent(ANDROID_UA)
    stubMatchMedia(false)

    render(
      <InstallAppGate>
        <div>dashboard content</div>
      </InstallAppGate>,
    )

    vi.advanceTimersByTime(1500)

    await waitFor(() => {
      expect(screen.getByText('Install Myle to continue')).toBeInTheDocument()
    })
    expect(screen.getByText(/Add to Home screen/i)).toBeInTheDocument()
    expect(screen.queryByText('dashboard content')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /skip|continue without|later/i })).toBeNull()
  })
})
