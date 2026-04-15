/**
 * Returns true only for http: or https: URLs with a host — blocks javascript:, data:, etc.
 */
export function isSafeHttpUrl(raw: string): boolean {
  const s = raw.trim()
  if (!s) return false
  try {
    const u = new URL(s)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    if (!u.hostname) return false
    return true
  } catch {
    return false
  }
}
