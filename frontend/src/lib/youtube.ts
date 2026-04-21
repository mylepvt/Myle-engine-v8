const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/

function sanitizeYouTubeId(candidate: string | null | undefined): string | null {
  const value = candidate?.trim()
  return value && YOUTUBE_ID_RE.test(value) ? value : null
}

function normalizeYouTubeHostname(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^(www|m|music)\./, '')
}

export function isYouTubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim())
    const hostname = normalizeYouTubeHostname(parsed.hostname)
    return hostname === 'youtube.com' || hostname === 'youtu.be' || hostname === 'youtube-nocookie.com'
  } catch {
    return false
  }
}

export function extractYouTubeId(url: string): string | null {
  const directId = sanitizeYouTubeId(url)
  if (directId) return directId

  try {
    const parsed = new URL(url.trim())
    const hostname = normalizeYouTubeHostname(parsed.hostname)

    if (hostname === 'youtu.be') {
      return sanitizeYouTubeId(parsed.pathname.split('/').filter(Boolean)[0] ?? null)
    }

    if (hostname === 'youtube.com' || hostname === 'youtube-nocookie.com') {
      const queryId = sanitizeYouTubeId(parsed.searchParams.get('v'))
      if (queryId) return queryId

      const segments = parsed.pathname.split('/').filter(Boolean)
      if (segments.length >= 2 && ['embed', 'shorts', 'live', 'v'].includes(segments[0])) {
        return sanitizeYouTubeId(segments[1])
      }
    }
  } catch {
    // Fall through to a looser pattern match so malformed-but-common share links still work.
  }

  const looseMatch = url.match(
    /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*?&)?v=|embed\/|shorts\/|live\/|v\/))([A-Za-z0-9_-]{11})/i,
  )
  return sanitizeYouTubeId(looseMatch?.[1] ?? null)
}

export function buildYouTubeEmbedUrl(videoId: string, autoplay = true): string {
  const safeVideoId = sanitizeYouTubeId(videoId)
  if (!safeVideoId) return ''

  const params = new URLSearchParams({
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
    controls: '1',
    fs: '1',
  })
  if (autoplay) {
    params.set('autoplay', '1')
  }
  return `https://www.youtube-nocookie.com/embed/${safeVideoId}?${params.toString()}`
}

export function buildEmbeddableVideoUrl(
  rawUrl: string | null | undefined,
  explicitVideoId: string | null | undefined,
  autoplay = true,
): string | null {
  const videoId = sanitizeYouTubeId(explicitVideoId) ?? (rawUrl ? extractYouTubeId(rawUrl) : null)
  if (videoId) {
    return buildYouTubeEmbedUrl(videoId, autoplay)
  }
  if (!rawUrl) return null
  return isYouTubeUrl(rawUrl) ? null : rawUrl
}

export function resolveYouTubeWatchUrl(
  rawUrl: string | null | undefined,
  explicitVideoId: string | null | undefined,
): string | null {
  const videoId = sanitizeYouTubeId(explicitVideoId) ?? (rawUrl ? extractYouTubeId(rawUrl) : null)
  if (videoId) {
    return `https://www.youtube.com/watch?v=${videoId}`
  }
  return rawUrl && isYouTubeUrl(rawUrl) ? rawUrl.trim() : null
}
