import { useEffect, useRef, useState } from 'react'
import { Mic, RotateCcw, Square, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { switchAudioSession } from '@/lib/audio-session'
import { formatClock } from '@/lib/format-clock'
import { encodeWav, resampleChunks, WAV_SAMPLE_RATE } from '@/lib/wav-encoder'

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

// DOMException isn't an Error subclass in every browser, so read the fields directly.
function errorName(err: unknown): string {
  const name = (err as { name?: unknown } | null)?.name
  return typeof name === 'string' ? name : ''
}

function recordingErrorMessage(err: unknown): string {
  const name = errorName(err)
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone permission is blocked. Allow the microphone for this app (iPhone: Settings → Safari → Microphone → Allow), then try again.'
  }
  if (name === 'NotFoundError') return 'No microphone found on this device.'
  if (name === 'NotReadableError' || name === 'AbortError') {
    return 'The microphone is busy. End any call or app using the mic, then try again.'
  }
  const message = (err as { message?: unknown } | null)?.message
  const detail = name || (typeof message === 'string' ? message : '')
  return `Could not start recording${detail ? ` (${detail})` : ''}. Please try again.`
}

export type VoiceRecording = { blob: Blob; durationSec: number; url: string }

/** A running capture; `stop` finishes it and hands the audio to the `onDone` it was started with. */
type CaptureEngine = { stop: () => void; isRecording: () => boolean }

function createAudioContext(): AudioContext | null {
  try {
    const Ctx =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    return Ctx ? new Ctx() : null
  } catch {
    return null
  }
}

function hasLiveAudio(stream: MediaStream): boolean {
  const tracks = typeof stream.getAudioTracks === 'function' ? stream.getAudioTracks() : []
  return tracks.length === 0 || tracks.some((t) => t.readyState !== 'ended')
}

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

  const engineRef = useRef<CaptureEngine | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const startedAtRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const meterRafRef = useRef<number | null>(null)
  const restoreSessionRef = useRef<(() => void) | null>(null)

  const supported =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    (typeof MediaRecorder !== 'undefined' ||
      typeof window.AudioContext !== 'undefined' ||
      'webkitAudioContext' in window)

  function stopHardware() {
    if (timerRef.current != null) window.clearInterval(timerRef.current)
    timerRef.current = null
    if (meterRafRef.current != null) cancelAnimationFrame(meterRafRef.current)
    meterRafRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (ctxRef.current) void ctxRef.current.close().catch(() => undefined)
    ctxRef.current = null
    engineRef.current = null
    restoreSessionRef.current?.()
    restoreSessionRef.current = null
    setLevel(0)
  }

  // Release the microphone and preview URL when leaving the page.
  useEffect(
    () => () => {
      if (engineRef.current?.isRecording()) engineRef.current.stop()
      stopHardware()
    },
    [],
  )
  useEffect(() => () => {
    if (recording) URL.revokeObjectURL(recording.url)
  }, [recording])

  function startMeter(ctx: AudioContext | null, stream: MediaStream) {
    if (!ctx) return
    try {
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      ctx.createMediaStreamSource(stream).connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        analyser.getByteTimeDomainData(data)
        let peak = 0
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128))
        setLevel(Math.min(1, peak / 64))
        meterRafRef.current = requestAnimationFrame(tick)
      }
      meterRafRef.current = requestAnimationFrame(tick)
    } catch {
      /* the level meter is cosmetic */
    }
  }

  async function openMic(): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
    } catch (err) {
      // Some phones reject the processing hints; plain audio still works there.
      const name = errorName(err)
      if (name === 'OverconstrainedError' || name === 'TypeError' || name === 'NotSupportedError') {
        return navigator.mediaDevices.getUserMedia({ audio: true })
      }
      throw err
    }
  }

  /**
   * Browser recorder (compressed MP4/WebM). iPhone Safari can report a format as supported and
   * still refuse it, so try the preferred setup first and fall back to the browser's defaults.
   */
  function startMediaRecorder(stream: MediaStream, onDone: (blob: Blob) => void): CaptureEngine {
    if (typeof MediaRecorder === 'undefined') throw new DOMException('MediaRecorder missing', 'NotSupportedError')
    const mimeType = pickMimeType()
    const attempts: (MediaRecorderOptions | undefined)[] = mimeType
      ? [{ mimeType, audioBitsPerSecond: 64_000 }, { mimeType }, undefined]
      : [undefined]
    let firstError: unknown = null
    for (const options of attempts) {
      for (const timeslice of [1000, undefined]) {
        try {
          const chunks: Blob[] = []
          const recorder = new MediaRecorder(stream, options)
          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunks.push(e.data)
          }
          recorder.onstop = () =>
            onDone(new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || 'audio/mp4' }))
          if (timeslice) recorder.start(timeslice)
          else recorder.start()
          return {
            stop: () => {
              if (recorder.state !== 'inactive') recorder.stop()
            },
            isRecording: () => recorder.state === 'recording',
          }
        } catch (err) {
          firstError ??= err
        }
      }
    }
    throw firstError ?? new Error('MediaRecorder could not start')
  }

  /** Fallback that works where MediaRecorder doesn't: raw samples via Web Audio, saved as WAV. */
  function startWavCapture(ctx: AudioContext, stream: MediaStream, onDone: (blob: Blob) => void): CaptureEngine {
    const source = ctx.createMediaStreamSource(stream)
    const processor = ctx.createScriptProcessor(4096, 1, 1)
    const mute = ctx.createGain()
    mute.gain.value = 0
    const chunks: Float32Array[] = []
    let active = true
    processor.onaudioprocess = (e) => {
      if (active) chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)))
    }
    source.connect(processor)
    processor.connect(mute)
    mute.connect(ctx.destination)
    return {
      stop: () => {
        if (!active) return
        active = false
        processor.onaudioprocess = null
        source.disconnect()
        processor.disconnect()
        mute.disconnect()
        const samples = resampleChunks(chunks, ctx.sampleRate, WAV_SAMPLE_RATE)
        onDone(encodeWav(samples, WAV_SAMPLE_RATE))
      },
      isRecording: () => active,
    }
  }

  async function start() {
    setError(null)
    setPhase('starting')
    // The app's UI sounds keep iOS in the 'ambient' audio session, where Safari refuses the mic
    // (InvalidStateError). Switch to recording mode first; stopHardware() switches back.
    restoreSessionRef.current?.()
    restoreSessionRef.current = switchAudioSession('play-and-record')
    // iPhone only lets audio start inside the tap itself, so open the audio engine before any await.
    const ctx = createAudioContext()
    ctxRef.current = ctx
    if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined)

    const finish = (blob: Blob) => {
      const durationSec = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
      stopHardware()
      // A WAV with only its 44-byte header captured no audio.
      if (blob.size === 0 || (blob.type === 'audio/wav' && blob.size <= 44)) {
        setError('Nothing was recorded. Please try again.')
        setPhase('idle')
        return
      }
      const next = { blob, durationSec, url: URL.createObjectURL(blob) }
      setRecording(next)
      setPhase('done')
      onChange(next)
    }

    try {
      let stream = await openMic()
      streamRef.current = stream
      let engine: CaptureEngine
      try {
        engine = startMediaRecorder(stream, finish)
      } catch (recorderError) {
        if (!ctx) throw recorderError
        // The failed recorder may have left the mic track unusable; reopen it if so.
        if (!hasLiveAudio(stream)) {
          stream.getTracks().forEach((t) => t.stop())
          stream = await openMic()
          streamRef.current = stream
        }
        if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined)
        engine = startWavCapture(ctx, stream, finish)
      }
      engineRef.current = engine
      startedAtRef.current = Date.now()
      setSeconds(0)
      setPhase('recording')
      startMeter(ctx, stream)
      timerRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000)
        setSeconds(elapsed)
        if (elapsed >= MAX_VOICE_SECONDS && engine.isRecording()) engine.stop()
      }, 250)
    } catch (err) {
      stopHardware()
      setPhase('idle')
      setError(recordingErrorMessage(err))
    }
  }

  function stop() {
    if (engineRef.current?.isRecording()) engineRef.current.stop()
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
