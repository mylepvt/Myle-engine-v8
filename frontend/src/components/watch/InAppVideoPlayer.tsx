import { useEffect, useState } from 'react'
import { ArrowUpRight, PlayCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { isYouTubeUrl } from '@/lib/youtube'

type InAppVideoPlayerProps = {
  embedUrl: string | null
  title: string
  fallbackUrl?: string | null
  previewEyebrow?: string
  previewTitle?: string
  previewDescription?: string
  playLabel?: string
}

const NATIVE_VIDEO_MIME_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogg: 'video/ogg',
  ogv: 'video/ogg',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  m3u8: 'application/x-mpegURL',
}

const VIDEO_MIME_HINT_KEYS = ['response-content-type', 'content-type', 'content_type', 'mime', 'type']

type PlaybackSource =
  | { kind: 'youtube'; src: string }
  | { kind: 'native'; src: string; mimeType?: string }
  | { kind: 'unsupported' }

function resolvePlaybackSource(rawUrl: string | null): PlaybackSource | null {
  const value = rawUrl?.trim()
  if (!value) return null
  if (isYouTubeUrl(value)) {
    return { kind: 'youtube', src: value }
  }

  try {
    const parsed = new URL(value, 'https://myle.local')
    const pathname = parsed.pathname.toLowerCase()
    const extMatch = pathname.match(/\.([a-z0-9]+)$/)
    const mimeTypeFromExt = extMatch ? NATIVE_VIDEO_MIME_TYPES[extMatch[1]] : undefined
    if (mimeTypeFromExt) {
      return { kind: 'native', src: value, mimeType: mimeTypeFromExt }
    }

    for (const key of VIDEO_MIME_HINT_KEYS) {
      const hintedMimeType = parsed.searchParams.get(key)?.trim().toLowerCase()
      if (!hintedMimeType) continue
      if (
        hintedMimeType.startsWith('video/') ||
        hintedMimeType === 'application/x-mpegurl' ||
        hintedMimeType === 'application/vnd.apple.mpegurl'
      ) {
        return {
          kind: 'native',
          src: value,
          mimeType:
            hintedMimeType === 'application/vnd.apple.mpegurl' ? 'application/x-mpegURL' : hintedMimeType,
        }
      }
    }
  } catch {
    return { kind: 'unsupported' }
  }

  return { kind: 'unsupported' }
}

export function InAppVideoPlayer({
  embedUrl,
  title,
  fallbackUrl = null,
  previewEyebrow = 'Ready inside Myle',
  previewTitle,
  previewDescription = 'Tap play to start the session inside the app without showing raw YouTube UI upfront.',
  playLabel = 'Play inside Myle',
}: InAppVideoPlayerProps) {
  const [playerActivated, setPlayerActivated] = useState(false)
  const playbackSource = resolvePlaybackSource(embedUrl)

  useEffect(() => {
    setPlayerActivated(false)
  }, [embedUrl, fallbackUrl, title])

  if (!playbackSource || playbackSource.kind === 'unsupported') {
    if (!fallbackUrl) {
      return (
        <div className="flex aspect-video items-center justify-center rounded-[2rem] border border-white/10 bg-white/[0.04] text-sm text-white/55">
          Video link is being prepared.
        </div>
      )
    }

    return (
      <div className="flex aspect-video flex-col items-center justify-center rounded-[2rem] border border-amber-300/20 bg-amber-300/[0.06] px-6 text-center">
        <p className="text-base font-semibold text-white">Video could not be played cleanly inside this room.</p>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-white/65">
          For the cleanest in-app player, use a direct hosted video file link like `.mp4` or `.webm` instead of a
          share-page URL.
        </p>
        <a
          href={fallbackUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/25 px-4 py-2 text-sm font-medium text-white transition hover:border-cyan-300/25 hover:text-cyan-100"
        >
          Open backup video
          <ArrowUpRight className="size-4" />
        </a>
      </div>
    )
  }

  if (!playerActivated) {
    return (
      <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.2),transparent_38%),linear-gradient(145deg,rgba(6,15,32,0.98),rgba(3,8,18,0.92))] shadow-[0_30px_80px_-35px_rgba(56,189,248,0.45)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.2),transparent_34%)]" />
        <div className="relative flex aspect-video flex-col justify-end p-5 md:p-7">
          <div className="max-w-xl">
            <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/75">{previewEyebrow}</p>
            <h3 className="mt-3 text-2xl font-semibold leading-tight text-white md:text-[2rem]">
              {previewTitle ?? title}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-white/68 md:text-base">
              {previewDescription}
            </p>
            <Button
              type="button"
              className="mt-5 inline-flex items-center gap-2"
              onClick={() => setPlayerActivated(true)}
            >
              <PlayCircle className="size-4" />
              {playLabel}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-black/70 shadow-[0_30px_80px_-35px_rgba(56,189,248,0.55)]">
      {playbackSource.kind === 'native' ? (
        <video
          className="aspect-video h-full w-full bg-black object-contain"
          src={playbackSource.src}
          title={title}
          controls
          playsInline
          preload="metadata"
          controlsList="nodownload noplaybackrate"
        >
          {playbackSource.mimeType ? <source src={playbackSource.src} type={playbackSource.mimeType} /> : null}
        </video>
      ) : (
        <iframe
          className="aspect-video h-full w-full bg-black"
          src={playbackSource.src}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      )}
      <div className="border-t border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-white/55">
        {playbackSource.kind === 'native'
          ? 'Playback stays inside Myle with native controls and fullscreen available from the player.'
          : 'Playback stays inside Myle. If the video pauses, tap once inside the player.'}
      </div>
    </div>
  )
}
