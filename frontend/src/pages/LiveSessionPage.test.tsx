import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { buildLiveSessionMessage, extractJoinUrl, extractPasscode, zoomMeetingId } from '@/lib/live-session-message'
import { LiveSessionPage } from '@/pages/LiveSessionPage'

const mockUseQuery = vi.fn()

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useQuery: (...args: Parameters<typeof actual.useQuery>) => mockUseQuery(...args),
  }
})

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

const ZOOM = 'https://us06web.zoom.us/j/89026736623?pwd=k3ba96OIa2n4Ad7OCR2AgDR98gZcSJ.1'

/** The team's message exactly as shared on WhatsApp (trailing spaces included). */
const EXPECTED = [
  '*✨ WELCOME TO TODAY’S SESSION ✨* ',
  '',
  '📌 *Today’s Topic* ',
  'What Will Be Your Exact Work?',
  '(Clear understanding of the work & system)',
  '',
  'By One & Only',
  '🔥 *Mr. Suraj Rathod* 🔥',
  'https://www.instagram.com/surajrathod.in?igsh=Y2lnc3h0bW13bjdo&utm_source=qr',
  '',
  '🏆 *Achievements:* FLP Youngest Manager | Top 5 FBO (India) | Car Plan L2 | MR L3',
  '',
  '📍 *Platform: Zoom*',
  '*👉 Join Here:* ',
  '',
  ZOOM,
  '',
  'Meeting ID: 890 2673 6623',
  'Passcode:  331434',
  '',
  '*⏰ Time: 2:00 PM*',
  '',
  '🚀 Clarity + Action = Growth',
].join('\n')

describe('LiveSessionPage', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows the fixed 2 PM message with today\'s link and a Join button', () => {
    mockUseQuery.mockReturnValue({
      data: { items: [{ title: "Today's Live Session", detail: '331434', external_href: ZOOM }] },
      isPending: false,
      isError: false,
    })
    renderWithProviders(<LiveSessionPage title="Live session" />)

    expect(screen.getByText('Mr. Suraj Rathod')).toBeInTheDocument()
    expect(screen.getByText(/Meeting ID: 890 2673 6623/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Join Now/ })).toHaveAttribute('href', ZOOM)
  })

  it('copies the message word for word, with the link, Meeting ID and passcode filled in', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    mockUseQuery.mockReturnValue({
      data: {
        items: [
          {
            title: "Today's Live Session",
            // older admin saves kept time/ID/passcode in one line — passcode is still found
            detail: '⏰ 2:00 PM · ID 890 2673 6623 · Passcode 331434',
            external_href: ZOOM,
            updated_at: '2026-09-30T13:05:00+05:30',
          },
        ],
      },
      isPending: false,
      isError: false,
    })
    renderWithProviders(<LiveSessionPage title="Live session" />)

    expect(screen.getByText(/Link updated:/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Copy message/ }))
    expect(writeText.mock.calls[0][0]).toBe(EXPECTED)
    await waitFor(() => expect(screen.getByRole('button', { name: /Copied/ })).toBeInTheDocument())
  })

  it('reads link and passcode out of a pasted Zoom invitation', () => {
    const invite = `Karan is inviting you to a scheduled Zoom meeting.\n\nJoin Zoom Meeting\n${ZOOM}\n\nMeeting ID: 890 2673 6623\nPasscode: 331434`
    expect(extractJoinUrl(invite)).toBe(ZOOM)
    expect(extractPasscode(invite)).toBe('331434')
    expect(zoomMeetingId(ZOOM)).toBe('890 2673 6623')
  })

  it('leaves out the Passcode line when none is set', () => {
    expect(buildLiveSessionMessage(ZOOM, '')).not.toContain('Passcode')
  })

  it('says when no link is published', () => {
    mockUseQuery.mockReturnValue({ data: { items: [{ title: "Today's Live Session" }] }, isPending: false, isError: false })
    renderWithProviders(<LiveSessionPage title="Live session" />)

    expect(screen.getByText('No live session link has been published yet.')).toBeInTheDocument()
  })
})
