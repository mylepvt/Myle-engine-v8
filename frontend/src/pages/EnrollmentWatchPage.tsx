import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'

import { apiUrl } from '@/lib/api'

type WatchData = {
  token: string
  title: string
  watermark_label: string
  access_granted: boolean
  stream_url: string | null
  window_seconds: number
  expires_at: string | null
  dead: boolean
  dead_reason: string | null
}

const FP_STORAGE_KEY = 'myle_enroll2_device'

/** Stable-ish per-device fingerprint: persisted random id mixed with coarse
 * device traits, hashed. Used for first-device lock. */
async function computeFingerprint(): Promise<string> {
  let persisted = ''
  try {
    persisted = localStorage.getItem(FP_STORAGE_KEY) || ''
    if (!persisted) {
      persisted = crypto.randomUUID()
      localStorage.setItem(FP_STORAGE_KEY, persisted)
    }
  } catch {
    persisted = 'no-storage'
  }
  const traits = [
    persisted,
    navigator.userAgent,
    navigator.language,
    String(screen.width),
    String(screen.height),
    String(screen.colorDepth),
    Intl.DateTimeFormat().resolvedOptions().timeZone || '',
  ].join('|')
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(traits))
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    // very old browser fallback — weak but non-empty
    return persisted.replace(/[^a-z0-9]/gi, '')
  }
}

async function readError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}))
  if (body && typeof body === 'object' && typeof (body as { detail?: unknown }).detail === 'string') {
    return String((body as { detail: string }).detail)
  }
  return fallback
}

export function EnrollmentWatchPage() {
  const { token } = useParams<{ token: string }>()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const maxTimeRef = useRef(0)

  const [data, setData] = useState<WatchData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)
  const [obscured, setObscured] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [wmPos, setWmPos] = useState({ top: 40, left: 40 })
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString())

  // ── load page meta ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) {
      setError('Invalid link.')
      setLoading(false)
      return
    }
    fetch(apiUrl(`/api/v1/enroll/${token}`), { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(await readError(res, `HTTP ${res.status}`))
        return res.json() as Promise<WatchData>
      })
      .then((payload) => {
        setData(payload)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load secure room.')
        setLoading(false)
      })
  }, [token])

  // ── countdown from expires_at ─────────────────────────────────────────────
  useEffect(() => {
    if (!data?.expires_at) return
    const target = new Date(data.expires_at).getTime()
    const tick = () => {
      const secs = Math.max(0, Math.round((target - Date.now()) / 1000))
      setRemaining(secs)
      if (secs <= 0) {
        videoRef.current?.pause()
        setData((cur) => (cur ? { ...cur, dead: true, dead_reason: 'This private video link has expired.', access_granted: false } : cur))
      }
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [data?.expires_at])

  // ── moving watermark + live clock ─────────────────────────────────────────
  useEffect(() => {
    if (!data?.access_granted) return
    const move = () => {
      setWmPos({ top: 10 + Math.random() * 75, left: 8 + Math.random() * 70 })
      setClock(new Date().toLocaleTimeString())
    }
    move()
    const id = window.setInterval(move, 2800)
    return () => window.clearInterval(id)
  }, [data?.access_granted])

  // ── anti-capture: blur/visibility → black out + pause ─────────────────────
  useEffect(() => {
    const hide = () => {
      setObscured(true)
      videoRef.current?.pause()
    }
    const show = () => setObscured(false)
    const onVis = () => (document.hidden ? hide() : show())
    window.addEventListener('blur', hide)
    window.addEventListener('focus', show)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('blur', hide)
      window.removeEventListener('focus', show)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  // ── anti-capture: block shortcuts + context menu ──────────────────────────
  useEffect(() => {
    const onCtx = (e: MouseEvent) => e.preventDefault()
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      const ctrl = e.ctrlKey || e.metaKey
      // PrintScreen: wipe clipboard + flash black
      if (e.key === 'PrintScreen') {
        navigator.clipboard?.writeText('').catch(() => {})
        setObscured(true)
        window.setTimeout(() => setObscured(false), 1200)
        return
      }
      if (
        e.key === 'F12' ||
        (ctrl && ['s', 'p', 'u'].includes(k)) ||
        (ctrl && e.shiftKey && ['i', 'j', 'c'].includes(k))
      ) {
        e.preventDefault()
      }
    }
    document.addEventListener('contextmenu', onCtx)
    document.addEventListener('keydown', onKey)
    document.addEventListener('keyup', onKey)
    return () => {
      document.removeEventListener('contextmenu', onCtx)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('keyup', onKey)
    }
  }, [])

  // ── start: bind device + open countdown ───────────────────────────────────
  const handleStart = useCallback(async () => {
    if (!token || opening) return
    setOpening(true)
    setOpenError(null)
    try {
      const fingerprint = await computeFingerprint()
      const res = await fetch(apiUrl(`/api/v1/enroll/${token}/open`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint }),
      })
      if (!res.ok) throw new Error(await readError(res, 'Could not open this video.'))
      const payload = (await res.json()) as WatchData
      setData(payload)
      maxTimeRef.current = 0
      setTimeout(() => videoRef.current?.play().catch(() => {}), 120)
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : 'Could not open this video.')
    } finally {
      setOpening(false)
    }
  }, [token, opening])

  const videoSrc = data?.stream_url ? apiUrl(data.stream_url) : null
  const mmss = remaining == null ? null : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`

  return (
    <div className="relative flex min-h-screen select-none flex-col bg-[#04070f] text-[#eaf0ff]">
      <header className="flex items-center justify-between px-4 py-3 sm:px-6">
        <span className="text-[11px] font-semibold uppercase tracking-[0.34em] text-[#8aa0cf]">Myle</span>
        <span className="flex items-center gap-1.5 rounded-full bg-[#14233f] px-3 py-1 text-[11px] font-semibold text-[#bcd0ff]">
          <ShieldCheck className="size-3.5" /> Private &amp; protected
          {mmss ? <span className="ml-1 tabular-nums text-[#ffd9a0]">· {mmss}</span> : null}
        </span>
      </header>

      <main className="flex flex-1 items-center justify-center px-3 pb-6 sm:px-6">
        {loading ? (
          <p className="text-sm text-[#8aa0cf]">Loading secure room…</p>
        ) : error || data?.dead ? (
          <div className="max-w-md rounded-2xl border border-[#5b2327] bg-[#160a0c] px-6 py-8 text-center">
            <p className="text-base font-semibold text-[#ffb8bd]">
              {error || data?.dead_reason || 'This link is no longer available.'}
            </p>
            <p className="mt-2 text-sm text-[#d6c3c7]">Please ask your contact for a fresh link.</p>
          </div>
        ) : data && !data.access_granted ? (
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-8 text-center">
            <h1 className="text-xl font-semibold">{data.title}</h1>
            <p className="mt-2 text-sm text-[#a9bbdd]">
              This is a one-time private video. It opens once, on this device only, and a {Math.round((data.window_seconds || 0) / 60)}-minute timer
              starts the moment you press play.
            </p>
            {openError ? <p className="mt-3 text-sm text-[#ffb8bd]">{openError}</p> : null}
            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={opening}
              className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#dce7ff] px-5 text-sm font-semibold text-[#0a1530] transition hover:bg-[#c6d8ff] disabled:opacity-60"
            >
              {opening ? 'Opening…' : 'Start watching'}
            </button>
          </div>
        ) : data && videoSrc ? (
          <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl bg-black">
            <video
              ref={videoRef}
              className="pointer-events-none aspect-video h-full w-full select-none bg-black object-contain"
              src={videoSrc}
              crossOrigin="use-credentials"
              playsInline
              autoPlay
              preload="metadata"
              controls={false}
              controlsList="nodownload nofullscreen noplaybackrate noremoteplayback"
              disablePictureInPicture
              tabIndex={-1}
              onContextMenu={(e) => e.preventDefault()}
              onPause={() => {
                if (!obscured && remaining !== 0) videoRef.current?.play().catch(() => {})
              }}
              onTimeUpdate={(e) => {
                maxTimeRef.current = Math.max(maxTimeRef.current, e.currentTarget.currentTime || 0)
              }}
              onSeeking={(e) => {
                const v = e.currentTarget
                if (v.currentTime > maxTimeRef.current + 0.4) v.currentTime = maxTimeRef.current
              }}
            />

            {/* moving identity watermark */}
            <div
              className="pointer-events-none absolute z-20 rounded bg-black/35 px-2 py-1 text-[11px] font-semibold tracking-wide text-white/80 backdrop-blur-[1px] transition-all duration-700"
              style={{ top: `${wmPos.top}%`, left: `${wmPos.left}%` }}
            >
              {data.watermark_label} · {clock}
            </div>
            {/* faint centred watermark for full coverage */}
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <span className="rotate-[-18deg] text-2xl font-bold text-white/[0.06] sm:text-4xl">
                {data.watermark_label}
              </span>
            </div>

            {/* black-out cover on blur / tab switch / printscreen */}
            {obscured ? (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black text-sm text-white/60">
                Paused — return to this tab to continue
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-[#8aa0cf]">Preparing your video…</p>
        )}
      </main>
    </div>
  )
}
