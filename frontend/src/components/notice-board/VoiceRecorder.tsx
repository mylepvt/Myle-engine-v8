import { useEffect, useRef, useState } from 'react'
import { Mic, RotateCcw, Square, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { formatClock } from '@/lib/format-clock'

export const MAX_VOICE_SECONDS = 10 * 60

// Most compatible first: MP4/AAC plays everywhere (incl. iPhone); WebM/Opus is Chrome/Android's default.
const MIME_CANDIDATES = [
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
]

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined
  }
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t))
}

export type VoiceRecording = { blob: Blob; durationSec: number; url: string }

type Phase = 'idle' | 'starting' | 'recording' | 'done'

/**
 * Record a voice note in the browser (mic permission → record → stop → preview).
 * Emits the finished recording through `onChange` (null when discarded).
 */
export function VoiceRecorder({
  disabled = false,
  onChange,
}: {
  disabled?: boolean
  onChange: (recording: VoiceRecording | null) => void
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [recording, setRecording] = useState<VoiceRecording | null>(null)
  const [level, setLevel] = useState(0)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const meterRef = useRef<{ ctx: AudioContext; raf: number } | null>(null)

  const supported =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'

  function stopHardware() {
    if (timerRef.current != null) window.clearInterval(timerRef.current)
    timerRef.current = null
    if (meterRef.current) {
      cancelAnimationFrame(meterRef.current.raf)
      void meterRef.current.ctx.close().catch(() => undefined)
      meterRef.current = null
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setLevel(0)
  }

  // Release the microphone and preview URL when leaving the page.
  useEffect(
    () => () => {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
      stopHardware()
    },
    [],
  )
  useEffect(() => () => {
    if (recording) URL.revokeObjectURL(recording.url)
  }, [recording])

  function startMeter(stream: MediaStream) {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      const ctx = new Ctx()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      ctx.createMediaStreamSource(stream).connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        analyser.getByteTimeDomainData(data)
        let peak = 0
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128))
        setLevel(Math.min(1, peak / 64))
        if (meterRef.current) meterRef.current.raf = requestAnimationFrame(tick)
      }
      meterRef.current = { ctx, raf: requestAnimationFrame(tick) }
    } catch {
      /* the level meter is cosmetic */
    }
  }

  async function start() {
    setError(null)
    setPhase('starting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      streamRef.current = stream
      const mimeType = pickMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 64_000 } : undefined)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const durationSec = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
        const type = recorder.mimeType || mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type })
        stopHardware()
        if (blob.size === 0) {
          setError('Nothing was recorded. Please try again.')
          setPhase('idle')
          return
        }
        const next = { blob, durationSec, url: URL.createObjectURL(blob) }
        setRecording(next)
        setPhase('done')
        onChange(next)
      }
      recorderRef.current = recorder
      recorder.start(1000)
      startedAtRef.current = Date.now()
      setSeconds(0)
      setPhase('recording')
      startMeter(stream)
      timerRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000)
        setSeconds(elapsed)
        if (elapsed >= MAX_VOICE_SECONDS && recorder.state === 'recording') recorder.stop()
      }, 250)
    } catch (err) {
      stopHardware()
      setPhase('idle')
      const name = err instanceof DOMException ? err.name : ''
      setError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Microphone permission is blocked. Allow the microphone for this app in your browser settings.'
          : name === 'NotFoundError'
            ? 'No microphone found on this device.'
            : 'Could not start recording. Please try again.',
      )
    }
  }

  function stop() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }

  function discard() {
    setRecording(null)
    setSeconds(0)
    setPhase('idle')
    onChange(null)
  }

  if (!supported) {
    return (
      <p className="rounded-lg border border-border/60 bg-muted/40 p-3 text-sm text-muted-foreground">
        Voice recording isn&apos;t supported in this browser. Open the app in Chrome or Safari.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {phase === 'idle' || phase === 'starting' ? (
        <button
          type="button"
          onClick={() => void start()}
          disabled={disabled || phase === 'starting'}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary/50 bg-primary/[0.06] px-4 py-5 text-sm font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-60"
        >
          <Mic className="size-5" />
          {phase === 'starting' ? 'Starting microphone…' : 'Tap to record a voice note'}
        </button>
      ) : null}

      {phase === 'recording' ? (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/[0.06] px-4 py-3">
          <span className="relative flex size-3 shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive/60" />
            <span className="relative inline-flex size-3 rounded-full bg-destructive" />
          </span>
          <span className="font-mono text-sm tabular-nums text-foreground">{formatClock(seconds)}</span>
          <div className="flex h-6 flex-1 items-center gap-0.5" aria-hidden>
            {Array.from({ length: 24 }).map((_, i) => (
              <span
                key={i}
                className="w-1 rounded-full bg-destructive/70 transition-[height] duration-75"
                style={{ height: `${Math.max(12, level * 100 * (0.55 + 0.45 * Math.sin((i + seconds) * 1.7) ** 2))}%` }}
              />
            ))}
          </div>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            max {formatClock(MAX_VOICE_SECONDS)}
          </span>
          <Button type="button" size="sm" onClick={stop} className="shrink-0">
            <Square className="mr-1 size-3.5" fill="currentColor" /> Stop
          </Button>
        </div>
      ) : null}

      {phase === 'done' && recording ? (
        <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Preview · {formatClock(recording.durationSec)}</span>
            <div className="flex gap-1">
              <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => { discard(); void start() }}>
                <RotateCcw className="mr-1 size-3.5" /> Re-record
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={discard} aria-label="Discard recording">
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>
          <audio src={recording.url} controls preload="metadata" className="h-10 w-full" />
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
