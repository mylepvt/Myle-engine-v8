export function extractYouTubeId(url: string): string | null {
  try {
    const shortMatch = url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/)
    if (shortMatch) return shortMatch[1]

    const parsed = new URL(url)

    const v = parsed.searchParams.get('v')
    if (v && v.length === 11) return v

    const embedMatch = parsed.pathname.match(/\/embed\/([A-Za-z0-9_-]{11})/)
    if (embedMatch) return embedMatch[1]

    const shortsMatch = parsed.pathname.match(/\/shorts\/([A-Za-z0-9_-]{11})/)
    if (shortsMatch) return shortsMatch[1]
  } catch {
    return null
  }
  return null
}
