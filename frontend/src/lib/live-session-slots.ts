import { apiFetch } from '@/lib/api'
import { whatsAppChatWithTextHref, whatsAppBusinessChatWithTextHref } from '@/lib/phone-links'

export type LiveSessionSlotOption = {
  hour: number
  label: string
  link: string
  liveStartsAt: string
  liveEndsAt: string
  state: 'upcoming' | 'waiting'
}

type ScheduleSlot = {
  hour: number
  label: string
  state: 'past' | 'upcoming' | 'waiting' | 'live'
  live_starts_at: string
  live_ends_at: string
}

type ScheduleResponse = {
  slots: ScheduleSlot[]
}

function baseOrigin(): string {
  return window.location.origin.replace(/\/$/, '')
}

export function buildLiveSessionSlotLink(hour: number, day = 1): string {
  return `${baseOrigin()}/premiere?day=${day}&slot=${hour}`
}

export async function fetchUpcomingLiveSessionSlots(day = 1): Promise<LiveSessionSlotOption[]> {
  const res = await apiFetch('/api/v1/other/premiere/schedule')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as ScheduleResponse

  return (data.slots ?? [])
    .filter((slot) => slot.state === 'waiting' || slot.state === 'upcoming')
    .map((slot) => ({
      hour: slot.hour,
      label: slot.label,
      link: buildLiveSessionSlotLink(slot.hour, day),
      liveStartsAt: slot.live_starts_at,
      liveEndsAt: slot.live_ends_at,
      state: slot.state,
    }))
}

export function buildLiveSessionWhatsAppUrl(
  phone: string | null | undefined,
  leadName: string | null | undefined,
  option: LiveSessionSlotOption,
  day = 1,
): string | null {
  const name = (leadName || 'there').trim() || 'there'
  const start = new Date(option.liveStartsAt).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  })
  const message = [
    `Hi ${name},`,
    '',
    `Your Myle Day ${day} live session is scheduled for ${start}.`,
    `Please join from this link at your session time:`,
    option.link,
  ].join('\n')
  const href = whatsAppChatWithTextHref(phone, message)
  return href === '#' ? null : href
}

export function buildLiveSessionWhatsAppBusinessUrl(
  phone: string | null | undefined,
  leadName: string | null | undefined,
  option: LiveSessionSlotOption,
  day = 1,
): string | null {
  const name = (leadName || 'there').trim() || 'there'
  const start = new Date(option.liveStartsAt).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  })
  const message = [
    `Hi ${name},`,
    '',
    `Your Myle Day ${day} live session is scheduled for ${start}.`,
    `Please join from this link at your session time:`,
    option.link,
  ].join('\n')
  const href = whatsAppBusinessChatWithTextHref(phone, message)
  return href === '#' ? null : href
}
