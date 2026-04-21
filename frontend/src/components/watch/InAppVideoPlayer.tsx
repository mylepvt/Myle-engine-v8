import { useEffect, useState } from 'react'
import { ArrowUpRight, PlayCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'

type InAppVideoPlayerProps = {
  embedUrl: string | null
  title: string
  fallbackUrl?: string | null
  previewEyebrow?: string
  previewTitle?: string
  previewDescription?: string
  playLabel?: string
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

  useEffect(() => {
    setPlayerActivated(false)
  }, [embedUrl, fallbackUrl, title])

  if (!embedUrl) {
    if (!fallbackUrl) {
      return (
        <div className="flex aspect-video items-center justify-center rounded-[2rem] border border-white/10 bg-white/[0.04] text-sm text-white/55">
          Video link is being prepared.
        </div>
      )
    }

    return (
      <div className="flex aspect-video flex-col items-center justify-center rounded-[2rem] border border-amber-300/20 bg-amber-300/[0.06] px-6 text-center">
        <p className="text-base font-semibold text-white">Video could not be embedded from this link.</p>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-white/65">
          We are blocking broken mobile watch URLs from rendering inside the player so the room stays clean.
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
      <iframe
        className="aspect-video h-full w-full bg-black"
        src={embedUrl}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
      <div className="border-t border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-white/55">
        Playback stays inside Myle. If the video pauses, tap once inside the player.
      </div>
    </div>
  )
}
