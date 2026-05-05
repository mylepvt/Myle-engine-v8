const LIVE_SESSION_SLOT_CONFIG = [
  { key: 'live_session_slot_11_00', label: '11:00 AM', hour24: 11, minute: 0 },
  { key: 'live_session_slot_12_00', label: '12:00 PM', hour24: 12, minute: 0 },
  { key: 'live_session_slot_13_00', label: '1:00 PM', hour24: 13, minute: 0 },
  { key: 'live_session_slot_14_00', label: '2:00 PM', hour24: 14, minute: 0 },
  { key: 'live_session_slot_15_00', label: '3:00 PM', hour24: 15, minute: 0 },
  { key: 'live_session_slot_16_00', label: '4:00 PM', hour24: 16, minute: 0 },
  { key: 'live_session_slot_17_00', label: '5:00 PM', hour24: 17, minute: 0 },
  { key: 'live_session_slot_18_00', label: '6:00 PM', hour24: 18, minute: 0 },
  { key: 'live_session_slot_19_00', label: '7:00 PM', hour24: 19, minute: 0 },
  { key: 'live_session_slot_20_00', label: '8:00 PM', hour24: 20, minute: 0 },
  { key: 'live_session_slot_21_00', label: '9:00 PM', hour24: 21, minute: 0 },
] as const

export type LiveSessionSlotOption = {
  key: string
  label: string
  url: string
}

function nowInIstParts(now = new Date()): { hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(now)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0')
  return { hour, minute }
}

export function upcomingLiveSessionSlots(
  settings: Record<string, string>,
  now = new Date(),
): LiveSessionSlotOption[] {
  const { hour, minute } = nowInIstParts(now)
  const currentMinutes = hour * 60 + minute

  return LIVE_SESSION_SLOT_CONFIG
    .filter((slot) => {
      const url = (settings[slot.key] ?? '').trim()
      if (!url) return false
      const slotMinutes = slot.hour24 * 60 + slot.minute
      return slotMinutes >= currentMinutes
    })
    .map((slot) => ({
      key: slot.key,
      label: slot.label,
      url: (settings[slot.key] ?? '').trim(),
    }))
}

export function allLiveSessionSlotKeys(): string[] {
  return LIVE_SESSION_SLOT_CONFIG.map((slot) => slot.key)
}
