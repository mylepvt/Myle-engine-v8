const ISO_WITH_OFFSET_RE = /(?:Z|[+-]\d{2}:\d{2})$/i

function normalizeApiDateInput(value: string): string {
  const raw = value.trim()
  if (!raw) return raw
  return ISO_WITH_OFFSET_RE.test(raw) ? raw : `${raw}Z`
}

export function parseApiDateMs(value: string | null | undefined): number {
  if (typeof value !== 'string') return Number.NaN
  return new Date(normalizeApiDateInput(value)).getTime()
}

export function parseApiDate(value: string | null | undefined): Date {
  return new Date(parseApiDateMs(value))
}
