/**
 * Best-effort message from FastAPI / generic JSON error bodies (used after non-OK fetch).
 */
export function messageFromApiErrorPayload(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback
  const b = body as Record<string, unknown>

  if (typeof b.message === 'string' && b.message.trim()) return b.message.trim()

  const err = b.error
  if (err && typeof err === 'object') {
    const m = (err as { message?: unknown }).message
    if (typeof m === 'string' && m.trim()) return m.trim()
  }

  const d = b.detail
  if (typeof d === 'string' && d.trim()) return d.trim()
  if (Array.isArray(d) && d.length > 0) {
    const first = d[0]
    if (first && typeof first === 'object') {
      const msg = (first as { msg?: unknown }).msg
      if (typeof msg === 'string' && msg.trim()) return msg.trim()
      const locMsg = (first as { loc?: unknown; msg?: unknown })
      if (typeof locMsg.msg === 'string' && locMsg.msg.trim()) return locMsg.msg.trim()
    }
  }

  return fallback
}
