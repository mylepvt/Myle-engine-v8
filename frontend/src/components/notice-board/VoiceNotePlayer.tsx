import { useEffect, useRef, useState } from 'react'
import { Loader2, Pause, Play } from 'lucide-react'

import { apiUrl } from '@/lib/api'
import { formatClock } from '@/lib/format-clock'
import { cn } from '@/lib/utils'

const SPEEDS = [1, 1.5, 2] as const
const PLAY_EVENT = 'myle:notice-audio-play'

/**
 * WhatsApp-style voice note player.
 *
 * - Only one voice note plays at a time across the page.
 * - Calls `onStart` the first time it plays in this view and `onFinish` when it reaches the end,
 *   so the notice board can record who listened.
 * - Browser-recorded WebM files often report an infinite duration; the server-provided
 *   `fallbackDuration` keeps the progress bar and timer meaningful.
 */
export function VoiceNotePlayer({
  id,
  src,
  fallbackDuration,
  unplayed = false,
  onStart,
  onFinish,
}: {
  id: number
  src: string
  fallbackDuration?: number | null
  unplayed?: boolean
  onStart?: () => void
  onFinish?: () => void
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const startedRef = useRef(false)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [current, setCurrent] = useState(0)
  const [mediaDuration, setMediaDuration] = useState<number | null>(null)
  const [speedIndex, setSpeedIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const duration =
    mediaDuration && Number.isFinite(mediaDuration) && mediaDuration > 0
      ? mediaDuration
      : fallbackDuration && fallbackDuration > 0
        ? fallbackDuration
        : 0
  const progress = duration > 0 ? Math.min(100, (current / duration) * 100) : 0

  // Pause when another voice note on the page starts.
  useEffect(() => {
    const onOtherPlay = (e: Event) => {
      if ((e as CustomEvent<number>).detail !== id) audioRef.current?.pause()
    }
    window.addEventListener(PLAY_EVENT, onOtherPlay)
    return () => window.removeEventListener(PLAY_EVENT, onOtherPlay)
  }, [id])

  async function toggle() {
    const audio = audioRef.current
    if (!audio) return
    setError(null)
    if (!audio.paused) {
      audio.pause()
      return
    }
    window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: id }))
    audio.playbackRate = SPEEDS[speedIndex]
    setLoading(true)
    try {
      await audio.play()
    } catch {
      setError('Could not play this voice note. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  function cycleSpeed() {
    const next = (speedIndex + 1) % SPEEDS.length
    setSpeedIndex(next)
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next]
  }

  function seek(value: number) {
    const audio = audioRef.current
    if (!audio || duration <= 0) return
    audio.currentTime = (value / 100) * duration
    setCurrent(audio.currentTime)
  }

  return (
    <div className="mt-1">
      <div
        className={cn(
          'flex items-center gap-3 rounded-full border px-2 py-1.5',
          unplayed ? 'border-primary/40 bg-primary/[0.07]' : 'border-border/60 bg-muted/40',
        )}
      >
        <button
          type="button"
          onClick={() => void toggle()}
          aria-label={playing ? 'Pause voice note' : 'Play voice note'}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform active:scale-95"
        >
          {loading ? (
            <Loader2 className="size-5 animate-spin" />
          ) : playing ? (
            <Pause className="size-5" fill="currentColor" />
          ) : (
            <Play className="ml-0.5 size-5" fill="currentColor" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <input
            type="range"
            min={0}
            max={100}
            step={0.1}
            value={progress}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Seek voice note"
            className="h-1.5 w-full cursor-pointer accent-primary"
            disabled={duration <= 0}
          />
          <div className="mt-0.5 flex justify-between text-ds-micro tabular-nums text-muted-foreground">
            <span>{formatClock(current)}</span>
            <span>{duration > 0 ? formatClock(duration) : '--:--'}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={cycleSpeed}
          aria-label="Playback speed"
          className="shrink-0 rounded-full border border-border/70 px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground hover:bg-muted"
        >
          {SPEEDS[speedIndex]}x
        </button>
      </div>
      {error ? (
        <p className="mt-1 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <audio
        ref={audioRef}
        src={apiUrl(src)}
        preload="metadata"
        className="hidden"
        onLoadedMetadata={(e) => setMediaDuration(e.currentTarget.duration)}
        onDurationChange={(e) => setMediaDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onWaiting={() => setLoading(true)}
        onPlaying={() => setLoading(false)}
        onPlay={() => {
          setPlaying(true)
          if (!startedRef.current) {
            startedRef.current = true
            onStart?.()
          }
        }}
        onPause={() => setPlaying(false)}
        onEnded={(e) => {
          setPlaying(false)
          setCurrent(0)
          e.currentTarget.currentTime = 0
          onFinish?.()
        }}
        onError={() => {
          setLoading(false)
          setError('This voice note could not be loaded.')
        }}
      />
    </div>
  )
}
