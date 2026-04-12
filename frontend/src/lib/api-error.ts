/**
 * Turn API JSON errors into a single line for UI (avoid raw JSON in red text).
 * Handles FastAPI `{ detail }`, app `{ error: { message, code } }`, and plain text.
 */
export async function getApiErrorMessage(res: Response): Promise<string> {
  const text = await res.text()
  if (!text.trim()) {
    return res.statusText || `HTTP ${res.status}`
  }
  try {
    const j = JSON.parse(text) as {
      detail?: unknown
      error?: { message?: string; code?: string }
    }
    if (typeof j.detail === 'string' && j.detail.trim()) {
      return j.detail
    }
    if (Array.isArray(j.detail) && j.detail.length > 0) {
      const first = j.detail[0] as { msg?: string; type?: string } | undefined
      if (first && typeof first.msg === 'string') {
        return first.msg
      }
    }
    if (j.error && typeof j.error.message === 'string' && j.error.message.trim()) {
      return j.error.message
    }
  } catch {
    return text
  }
  return text
}
