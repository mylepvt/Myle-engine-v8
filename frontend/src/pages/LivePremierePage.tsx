import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { apiUrl } from '@/lib/api'
import { whatsAppChatWithTextHref } from '@/lib/phone-links'

type PoolEntry = { name: string; city: string }

async function fetchPool(): Promise<PoolEntry[]> {
  try {
    const res = await fetch(apiUrl('/api/v1/other/premiere/pool'))
    if (!res.ok) return []
    return res.json() as Promise<PoolEntry[]>
  } catch {
    return []
  }
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

const AVATAR_COLORS: [string, string][] = [
  ['#c5d3ff', '#7d97e6'],
  ['#ffd8c5', '#e69a7d'],
  ['#c5ffe1', '#7de6b1'],
  ['#ffe5c5', '#e6c87d'],
  ['#e6c5ff', '#a77de6'],
  ['#c5e9ff', '#7dbde6'],
  ['#ffc5d9', '#e67da0'],
]

function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()
  const idx = ((name.charCodeAt(0) ?? 0) + (name.charCodeAt(name.length - 1) ?? 0)) % AVATAR_COLORS.length
  const [c1, c2] = AVATAR_COLORS[idx]
  return (
    <span
      style={{
        width: size, height: size, flexShrink: 0,
        borderRadius: 999,
        background: `linear-gradient(135deg, ${c1}, ${c2})`,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.4, fontWeight: 600, color: '#0a1226',
        border: '1px solid rgba(255,255,255,0.10)',
        boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
      }}
    >{initials}</span>
  )
}

function getSlotParam(): number | null {
  const v = new URLSearchParams(window.location.search).get('slot')
  const n = v !== null ? parseInt(v, 10) : NaN
  return !isNaN(n) && n >= 0 && n <= 23 ? n : null
}

function getDayParam(): number {
  const v = new URLSearchParams(window.location.search).get('day')
  const n = v !== null ? parseInt(v, 10) : NaN
  return !isNaN(n) && n >= 1 && n <= 3 ? n : 1
}

// ─── Types ───────────────────────────────────────────────────────────────────

type PremiereState = 'upcoming' | 'waiting' | 'live' | 'ended'

type PremiereData = {
  state: PremiereState
  video_url: string | null
  waiting_starts_at: string
  live_starts_at: string
  live_ends_at: string
  session_hour: number
  server_now: string
  viewer_count: number
}

type ProspectInfo = {
  name: string
  city: string
  phone: string
  viewer_id: string
}

// ─── Storage ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'myle_premiere_prospect'

function loadProspect(): ProspectInfo | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as ProspectInfo
  } catch {
    return null
  }
}

function saveProspect(info: ProspectInfo) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(info))
}

function genViewerId(): string {
  if (crypto?.randomUUID) return crypto.randomUUID()
  return 'v-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function fetchPremiereState(): Promise<PremiereData> {
  const slotParam = getSlotParam()
  const day = getDayParam()
  const params = new URLSearchParams()
  if (slotParam !== null) params.set('slot', String(slotParam))
  params.set('day', String(day))
  const res = await fetch(apiUrl(`/api/v1/other/premiere?${params.toString()}`))
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<PremiereData>
}

async function postSilent(path: string, body: unknown): Promise<void> {
  try {
    await fetch(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    // silent
  }
}

function formatCountdown(targetIso: string, nowMs: number): string {
  const diff = new Date(targetIso).getTime() - nowMs
  if (diff <= 0) return '00:00'
  const totalSec = Math.floor(diff / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatTimeIST(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Asia/Kolkata', hour12: true,
    })
  } catch { return '—' }
}

function formatDateIST(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long',
      timeZone: 'Asia/Kolkata',
    })
  } catch { return '' }
}

function resolveWish(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  if (h < 21) return 'Good evening'
  return 'Good night'
}

// Realistic live viewer count simulation:
// - State-aware trend: climb during waiting, surge at live start, gradual decay, fast drop at end
// - Multi-frequency: micro ticks (3-7s, ±1) + macro shifts (35-65s, ±9)
// - Burst joins (every 2-4 min, +8-20) with decay trail
// - Non-round ceiling: stable random offset keeps count off exact max
// - Irregular timing: all intervals randomised
// - Re-anchors smoothly when server sends updated count
function useViewerCount(
  serverCount: number,
  state: string,
  liveStartsAt: string,
  liveEndsAt: string,
  waitingStartsAt: string,
): number {
  const active = state === 'waiting' || state === 'live'

  // Stable non-round offset so we never sit on exact ceiling
  const offsetRef = useRef(Math.floor(Math.random() * 5) + 3)
  const countRef  = useRef(serverCount ? serverCount - offsetRef.current : 267)
  const aliveRef  = useRef(false)

  const [display, setDisplay] = useState(countRef.current)

  // Mutable refs so closures always read latest values without re-triggering effects
  const stateRef          = useRef(state)
  const serverCountRef    = useRef(serverCount)
  const liveStartsAtRef   = useRef(liveStartsAt)
  const liveEndsAtRef     = useRef(liveEndsAt)
  const waitingStartsAtRef = useRef(waitingStartsAt)
  useEffect(() => { stateRef.current = state },                [state])
  useEffect(() => { serverCountRef.current = serverCount },    [serverCount])
  useEffect(() => { liveStartsAtRef.current = liveStartsAt },  [liveStartsAt])
  useEffect(() => { liveEndsAtRef.current = liveEndsAt },      [liveEndsAt])
  useEffect(() => { waitingStartsAtRef.current = waitingStartsAt }, [waitingStartsAt])

  function getTarget(): number {
    const sc = serverCountRef.current
    const st = stateRef.current
    if (!sc) return countRef.current
    const base = sc - offsetRef.current
    const now  = Date.now()

    if (st === 'waiting') {
      const waitStart = new Date(waitingStartsAtRef.current).getTime()
      const liveStart = new Date(liveStartsAtRef.current).getTime()
      const dur       = Math.max(1, liveStart - waitStart)
      const progress  = Math.min(1, Math.max(0, (now - waitStart) / dur))
      // Climb from 65% → 100% of base as waiting room fills up
      return Math.round(base * (0.65 + 0.35 * progress))
    }

    if (st === 'live') {
      const liveStart = new Date(liveStartsAtRef.current).getTime()
      const liveEnd   = new Date(liveEndsAtRef.current).getTime()
      const dur       = Math.max(1, liveEnd - liveStart)
      const progress  = Math.min(1, Math.max(0, (now - liveStart) / dur))

      // 0-15%: excitement surge +5%
      if (progress < 0.15) return Math.round(base * (1.00 + 0.05 * (progress / 0.15)))
      // 15-50%: plateau decay back to base
      if (progress < 0.50) return Math.round(base * (1.05 - 0.05 * ((progress - 0.15) / 0.35)))
      // 50-80%: gradual drop -10%
      if (progress < 0.80) return Math.round(base * (1.00 - 0.10 * ((progress - 0.50) / 0.30)))
      // 80-100%: faster tail drop -15% more
      return Math.round(base * (0.90 - 0.15 * ((progress - 0.80) / 0.20)))
    }

    return base
  }

  useEffect(() => {
    if (!active) return
    aliveRef.current = true

    const init = getTarget()
    countRef.current = init
    setDisplay(init)

    const after = (fn: () => void, lo: number, hi: number) =>
      window.setTimeout(fn, lo + Math.random() * (hi - lo))

    function microTick() {
      if (!aliveRef.current) return
      const target = getTarget()
      const delta  = Math.floor(Math.random() * 3) - 1  // -1 to +1
      countRef.current = Math.min(target + 3, Math.max(Math.max(1, target - 15), countRef.current + delta))
      setDisplay(countRef.current)
      after(microTick, 3000, 7000)
    }

    function macroTick() {
      if (!aliveRef.current) return
      const target = getTarget()
      const delta  = Math.floor(Math.random() * 19) - 9  // -9 to +9
      countRef.current = Math.min(target + 5, Math.max(Math.max(1, target - 20), countRef.current + delta))
      setDisplay(countRef.current)
      after(macroTick, 35000, 65000)
    }

    function burstTick() {
      if (!aliveRef.current) return
      if (stateRef.current === 'live') {
        const target = getTarget()
        const burst  = Math.floor(Math.random() * 13) + 8  // +8 to +20
        countRef.current = Math.min(target + 6, countRef.current + burst)
        setDisplay(countRef.current)
        let d = 0
        function decayStep() {
          if (!aliveRef.current) return
          if (d >= 5) { after(burstTick, 120000, 240000); return }
          countRef.current = Math.max(1, countRef.current - Math.floor(Math.random() * 3 + 1))
          setDisplay(countRef.current)
          d++
          after(decayStep, 4000, 7000)
        }
        after(decayStep, 4000, 7000)
      } else {
        after(burstTick, 60000, 120000)
      }
    }

    after(microTick, 3000,   7000)
    after(macroTick, 35000, 65000)
    after(burstTick, 120000, 240000)

    return () => { aliveRef.current = false }
  }, [active])  // restart only when active flips

  // Smooth re-anchor when server count updates (blend toward new target)
  useEffect(() => {
    if (serverCount && active) {
      const target = getTarget()
      countRef.current = Math.round((countRef.current + target) / 2)
      setDisplay(countRef.current)
    }
  }, [serverCount])  // eslint-disable-line react-hooks/exhaustive-deps

  return display
}

// ─── Join Feed ───────────────────────────────────────────────────────────────

const FIRST_NAMES = [
  'Aarav','Vivaan','Aditya','Vihaan','Arjun','Sai','Reyansh','Ayaan',
  'Krishna','Ishaan','Shaurya','Atharva','Pranav','Advait','Dhruv','Kabir',
  'Ritvik','Aarush','Veer','Arnav','Harsh','Rohan','Karan','Rahul','Nikhil',
  'Vikram','Amit','Suresh','Mohit','Sumit','Rajesh','Ramesh','Dinesh','Sunil',
  'Anil','Vijay','Rakesh','Mahesh','Naresh','Ganesh','Yogesh','Mukesh',
  'Aanya','Aadhya','Ananya','Pari','Anika','Navya','Diya','Riya','Priya',
  'Neha','Pooja','Sneha','Nisha','Divya','Anjali','Meera','Kavya','Ishita',
  'Khushi','Tanvi','Shruti','Sanya','Jiya','Avni','Simran','Radhika','Swati',
  'Pallavi','Deepika','Sunita','Preeti','Rekha','Usha','Geeta','Seema',
]

const CITIES = [
  'Mumbai','Delhi','Bengaluru','Hyderabad','Pune','Chennai','Kolkata',
  'Jaipur','Surat','Ahmedabad','Lucknow','Kanpur','Nagpur','Indore',
  'Bhopal','Patna','Vadodara','Ludhiana','Agra','Nashik','Ranchi',
  'Faridabad','Meerut','Chandigarh','Coimbatore',
]

type JoinEntry = { id: number; name: string; city: string }

function useJoinFeed(
  state: string,
  liveStartsAt: string,
  liveEndsAt: string,
  pool: PoolEntry[],
): JoinEntry[] {
  const active = state === 'waiting' || state === 'live'
  const [entries, setEntries] = useState<JoinEntry[]>([])
  const idRef        = useRef(0)
  const aliveRef     = useRef(false)
  const stateRef     = useRef(state)
  const liveStartRef = useRef(liveStartsAt)
  const liveEndRef   = useRef(liveEndsAt)
  const poolRef      = useRef(pool)
  useEffect(() => { stateRef.current = state },             [state])
  useEffect(() => { liveStartRef.current = liveStartsAt },  [liveStartsAt])
  useEffect(() => { liveEndRef.current = liveEndsAt },      [liveEndsAt])
  useEffect(() => { poolRef.current = pool },               [pool])

  function pickEntry(): { name: string; city: string } {
    const p = poolRef.current
    if (p.length > 0) return p[Math.floor(Math.random() * p.length)]
    return {
      name: FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)],
      city: CITIES[Math.floor(Math.random() * CITIES.length)],
    }
  }

  function nextDelay(): number {
    const st = stateRef.current
    if (st === 'waiting') return 22000 + Math.random() * 20000
    if (st === 'live') {
      const start    = new Date(liveStartRef.current).getTime()
      const end      = new Date(liveEndRef.current).getTime()
      const dur      = Math.max(1, end - start)
      const progress = Math.min(1, Math.max(0, (Date.now() - start) / dur))
      if (progress < 0.15) return 5000  + Math.random() * 9000
      if (progress < 0.75) return 16000 + Math.random() * 18000
      return 45000 + Math.random() * 45000
    }
    return 30000
  }

  useEffect(() => {
    if (!active) return
    aliveRef.current = true

    function emit() {
      if (!aliveRef.current) return
      const { name, city } = pickEntry()
      setEntries(prev => [...prev.slice(-7), { id: ++idRef.current, name, city }])
      window.setTimeout(emit, nextDelay())
    }

    window.setTimeout(emit, 3000 + Math.random() * 5000)
    return () => { aliveRef.current = false }
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps

  return entries
}

function JoinFeed({ entries }: { entries: JoinEntry[] }) {
  if (entries.length === 0) return null
  const visible = entries.slice(-5)
  return (
    <div className="w-full max-w-2xl space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-[#7a94c4]">Joining now</span>
        <span className="text-[10.5px] text-[#7a94c4]">Live feed</span>
      </div>
      {visible.map((e, i) => (
        <div
          key={e.id}
          style={{ opacity: 0.42 + 0.58 * ((i + 1) / visible.length) }}
          className="flex items-center justify-between rounded-2xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-2.5"
        >
          <div className="flex items-center gap-2.5">
            <Avatar name={e.name} size={26} />
            <div className="text-[13px] text-[#f3f7ff]">
              <span className="font-semibold">{e.name}</span>
              <span className="text-[#7a94c4]"> from {e.city}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400">joined</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Registration Form ───────────────────────────────────────────────────────

function ProspectForm({ onSubmit }: { onSubmit: (info: ProspectInfo) => void }) {
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const weekAttended = useState(() => 720 + Math.floor(Math.random() * 180))[0]
  const onlineNow = useState(() => 38 + Math.floor(Math.random() * 40))[0]

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !city.trim() || !phone.trim()) {
      setError('Please fill in all fields.')
      return
    }
    if (phone.replace(/\D/g, '').length < 10) {
      setError('Enter a valid 10-digit WhatsApp number.')
      return
    }
    setError('')
    const info: ProspectInfo = {
      name: name.trim(),
      city: city.trim(),
      phone: phone.trim(),
      viewer_id: genViewerId(),
    }
    saveProspect(info)
    onSubmit(info)
  }

  const sampleNames = ['Aarav S', 'Priya K', 'Neha R', 'Vikram T']

  return (
    <div className="relative mx-auto w-full max-w-md">
      {/* Brand + secure row */}
      <div className="mb-7 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#9db0d6]">MYLE</span>
        <div className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_0_0_rgba(34,197,94,0.5)] animate-pulse" />
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#7a94c4]">SECURE</span>
        </div>
      </div>

      {/* Invitation verified pill */}
      <div className="mb-5 flex items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(142,176,255,0.25)] bg-[rgba(142,176,255,0.08)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#c8d6ff]">
          <span className="size-1.5 rounded-full bg-emerald-400" />
          Invitation Verified
        </span>
      </div>

      <h2 className="text-[28px] font-bold leading-[1.12] tracking-tight text-white">
        Register for today's<br />private session.
      </h2>
      <p className="mt-2.5 text-[13px] text-[#7a94c4]">
        Private &nbsp;·&nbsp; Invitation only &nbsp;·&nbsp; Limited access
      </p>

      {/* Glass form card */}
      <div className="mt-7 rounded-[2rem] border border-white/[0.09] bg-[rgba(255,255,255,0.04)] px-5 py-5 shadow-[0_40px_80px_-40px_rgba(0,0,0,0.7)] backdrop-blur-2xl">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <label className="block text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#7a94c4]" htmlFor="p-name">Full name</label>
            <input
              id="p-name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(ev) => setName(ev.target.value)}
              placeholder="Rahul Verma"
              className="h-[52px] w-full rounded-2xl border border-white/[0.08] bg-white/[0.025] px-4 text-[15px] text-[#f3f7ff] outline-none transition placeholder:text-white/30 focus:border-[rgba(142,176,255,0.45)] focus:bg-[rgba(142,176,255,0.04)] focus:ring-2 focus:ring-[rgba(142,176,255,0.08)]"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#7a94c4]" htmlFor="p-city">City</label>
            <input
              id="p-city"
              type="text"
              autoComplete="address-level2"
              value={city}
              onChange={(ev) => setCity(ev.target.value)}
              placeholder="Mumbai"
              className="h-[52px] w-full rounded-2xl border border-white/[0.08] bg-white/[0.025] px-4 text-[15px] text-[#f3f7ff] outline-none transition placeholder:text-white/30 focus:border-[rgba(142,176,255,0.45)] focus:bg-[rgba(142,176,255,0.04)] focus:ring-2 focus:ring-[rgba(142,176,255,0.08)]"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#7a94c4]" htmlFor="p-phone">WhatsApp number</label>
            <div className="flex items-stretch gap-2">
              <div className="flex items-center gap-1.5 rounded-2xl border border-white/[0.08] bg-white/[0.025] px-3 text-[14px] text-[#b8c7e6]">
                <span className="text-base">🇮🇳</span>
                <span className="font-medium tabular-nums">+91</span>
              </div>
              <input
                id="p-phone"
                type="tel"
                autoComplete="tel"
                inputMode="numeric"
                value={phone}
                onChange={(ev) => setPhone(ev.target.value)}
                placeholder="98••• ••••2"
                className="h-[52px] flex-1 rounded-2xl border border-white/[0.08] bg-white/[0.025] px-4 text-[15px] text-[#f3f7ff] outline-none transition placeholder:text-white/30 focus:border-[rgba(142,176,255,0.45)] focus:bg-[rgba(142,176,255,0.04)] focus:ring-2 focus:ring-[rgba(142,176,255,0.08)]"
              />
            </div>
          </div>

          {error && <p className="text-xs text-[#ffb8bd]" role="alert">{error}</p>}

          <button
            type="submit"
            className="flex h-[54px] w-full items-center justify-center gap-2.5 rounded-2xl bg-[linear-gradient(180deg,#fafbff_0%,#e6ecf8_100%)] text-[15px] font-semibold text-[#07142e] shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_18px_40px_-16px_rgba(142,176,255,0.45)] transition hover:-translate-y-px active:translate-y-px"
          >
            Join the session
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8h10m0 0L9 4m4 4L9 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <div className="flex items-center gap-2 text-[11.5px] text-[#7a94c4]">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="2" y="5" width="8" height="6" rx="1.4" stroke="currentColor" strokeOpacity="0.7" />
              <path d="M4 5V3.5a2 2 0 014 0V5" stroke="currentColor" strokeOpacity="0.7" />
            </svg>
            <span>Your details stay private — used only for session access.</span>
          </div>
        </form>
      </div>

      {/* Community strip */}
      <div className="mt-5 flex items-center justify-between rounded-[1.25rem] border border-white/[0.07] bg-white/[0.025] px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex">
            {sampleNames.map((n, idx) => (
              <span key={n} style={{ marginLeft: idx === 0 ? 0 : -8, zIndex: sampleNames.length - idx }}>
                <Avatar name={n} size={26} />
              </span>
            ))}
          </div>
          <div>
            <div className="text-[13px] font-medium text-white">
              <span className="tabular-nums">{weekAttended}</span> attended this week
            </div>
            <div className="text-[11px] text-[#7a94c4]">From 38 cities across India</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_0_0_rgba(34,197,94,0.5)] animate-pulse" />
          <span className="tabular-nums text-[11px] text-[#b8c7e6]">{onlineNow} online</span>
        </div>
      </div>

      {/* Session footer */}
      <div className="mt-5 flex items-center justify-between text-[10.5px] font-medium uppercase tracking-[0.18em] text-[#7a94c4]">
        <div className="flex items-center gap-1.5">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeOpacity="0.5" />
            <path d="M5.5 3v2.5L7 7" stroke="currentColor" strokeOpacity="0.7" strokeLinecap="round" />
          </svg>
          <span>Session · Today 8:00 PM IST</span>
        </div>
        <span>Cohort · 26-B</span>
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function LivePremierePage() {
  const sessionDay = getDayParam()
  const { data, isError } = useQuery({
    queryKey: ['premiere', 'state', sessionDay],
    queryFn: fetchPremiereState,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
  })

  const [prospect, setProspect] = useState<ProspectInfo | null>(() => loadProspect())
  const [nowMs, setNowMs] = useState(() => Date.now())
  const registeredRef = useRef(false)

  const state = data?.state ?? 'upcoming'

  const poolQuery = useQuery({
    queryKey: ['premiere', 'pool'],
    queryFn: fetchPool,
    staleTime: 120_000,
    enabled: state === 'waiting' || state === 'live',
  })

  const viewerCount = useViewerCount(
    data?.viewer_count ?? 0,
    state,
    data?.live_starts_at ?? '',
    data?.live_ends_at ?? '',
    data?.waiting_starts_at ?? '',
  )
  const joinEntries = useJoinFeed(
    state,
    data?.live_starts_at ?? '',
    data?.live_ends_at ?? '',
    poolQuery.data ?? [],
  )
  const firstName = prospect?.name.trim().split(/\s+/)[0] ?? ''
  const wish = resolveWish()

  // Tick for countdown
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [])

  // Register viewer when prospect + state known — re-register on session_hour change
  const lastRegisteredHour = useRef<number | null>(null)
  useEffect(() => {
    if (!prospect || !data) return
    if (lastRegisteredHour.current === data.session_hour) return
    lastRegisteredHour.current = data.session_hour
    void postSilent('/api/v1/other/premiere/register', {
      viewer_id: prospect.viewer_id,
      name: prospect.name,
      city: prospect.city,
      phone: prospect.phone,
      session_hour: data.session_hour,
      session_day: sessionDay,
      state: data.state,
    })
  }, [prospect, data])

  // Heartbeat every 15s
  useEffect(() => {
    if (!prospect || !data || (state !== 'waiting' && state !== 'live')) return
    const sessionHour = data.session_hour
    const id = window.setInterval(() => {
      void postSilent('/api/v1/other/premiere/heartbeat', {
        viewer_id: prospect.viewer_id,
        session_hour: sessionHour,
        session_day: sessionDay,
        state,
      })
    }, 15_000)
    return () => window.clearInterval(id)
  }, [prospect, data, state])

  // Registration form gate
  if (!prospect) {
    return (
      <div className="relative min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,#1a2d50_0%,#0d1525_32%,#060a17_66%,#02040a_100%)] text-[#f3f7ff]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(circle_at_top,rgba(130,180,255,0.12),transparent_60%)]" />
        <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-10">
          <p className="mb-8 text-[11px] font-semibold uppercase tracking-[0.34em] text-[#9db0d6]">Myle</p>
          <ProspectForm
            onSubmit={(info) => {
              setProspect(info)
              registeredRef.current = false
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,#1a2d50_0%,#0d1525_32%,#060a17_66%,#02040a_100%)] text-[#f3f7ff]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(circle_at_top,rgba(130,180,255,0.12),transparent_60%)]" />
      {state === 'waiting' && (
        <div className="pointer-events-none absolute inset-0 animate-pulse bg-[radial-gradient(circle_at_50%_40%,rgba(99,102,241,0.07),transparent_55%)]" />
      )}

      <div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 sm:px-6 sm:py-8">

        {/* Header */}
        <header className="rounded-[2rem] border border-white/10 bg-muted/40 px-5 py-4 backdrop-blur-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-[#9db0d6]">Myle</p>
              <h1 className="mt-1 text-ds-h2">Private Live Session</h1>
            </div>
            <div className="flex items-center gap-3">
              {(state === 'waiting' || state === 'live') && viewerCount > 0 && (
                <span className="flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-[12px] font-semibold text-red-300 tabular-nums transition-all duration-700">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-red-400" />
                  </span>
                  {viewerCount} watching
                </span>
              )}
              {state === 'live' && (
                <span className="flex items-center gap-1.5 rounded-full bg-red-600/90 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white shadow-[0_0_14px_rgba(220,38,38,0.55)]">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-red-400" />
                  </span>
                  Live
                </span>
              )}
              {data && (
                <p className="hidden rounded-full border border-[#3f537d] bg-[#0b1120] px-4 py-2 text-[11px] font-semibold text-[#c9d9ff] sm:block">
                  {formatDateIST(data.live_starts_at)}
                </p>
              )}
            </div>
          </div>
        </header>

        {/* Greeting bar */}
        <div className="mt-4 flex items-center justify-between rounded-[1.25rem] border border-white/[0.07] bg-white/[0.025] px-4 py-3 backdrop-blur-xl">
          <div className="flex items-center gap-2.5">
            <Avatar name={prospect.name || 'M'} size={32} />
            <div>
              <p className="text-[13.5px] font-medium text-white">{wish}, {firstName} 👋</p>
              <p className="text-[11px] text-[#7a94c4]">{prospect.city} · {prospect.phone}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-emerald-400">connected</span>
          </div>
        </div>

        <main className="flex flex-1 flex-col items-center justify-center gap-5 py-8">
          {isError && (
            <div className="rounded-[2rem] border border-[#5b2327] bg-[#100708] px-6 py-8 text-center" role="alert">
              <p className="text-base font-semibold text-[#ffb8bd]">Could not load session info.</p>
              <p className="mt-2 text-sm text-[#d6c3c7]">Please refresh the page.</p>
            </div>
          )}

          {/* UPCOMING */}
          {state === 'upcoming' && data && (
            <section className="w-full max-w-2xl space-y-4">
              <div className="rounded-[2.25rem] border border-white/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] px-5 py-8 text-center shadow-[0_40px_140px_-86px_rgba(0,0,0,0.95)] backdrop-blur-2xl md:px-8 md:py-10">
                <p className="text-xs font-semibold uppercase tracking-widest text-[#9db0d6]">Exclusive live session</p>
                <p className="mt-4 text-[clamp(3rem,8vw,5rem)] font-bold tabular-nums tracking-tight text-[#f7f9ff]">
                  {formatTimeIST(data.live_starts_at)}
                </p>
                <p className="mt-3 text-sm font-medium text-[#7a94c4]">
                  Waiting room opens at {formatTimeIST(data.waiting_starts_at)} — join a few minutes early
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {([
                  ['Format', 'Live video', 'Real-time session'],
                  ['Access', 'Private link', 'Invited only'],
                  ['Action', 'Join on time', 'Limited seats'],
                ] as const).map(([label, title, sub]) => (
                  <div key={label} className="rounded-[1.4rem] border border-white/8 bg-muted/30 px-4 py-4 text-center backdrop-blur-xl">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#9db0d6]">{label}</p>
                    <p className="mt-2 text-sm font-semibold text-[#f0f4ff]">{title}</p>
                    <p className="mt-0.5 text-xs text-[#7a94c4]">{sub}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* WAITING */}
          {state === 'waiting' && data && (
            <div className="w-full max-w-2xl space-y-4">
              {/* Countdown hero */}
              <section className="rounded-[2.25rem] border border-indigo-500/20 bg-[linear-gradient(160deg,rgba(99,102,241,0.08),rgba(255,255,255,0.03))] px-5 py-10 text-center shadow-[0_40px_140px_-86px_rgba(0,0,0,0.95)] backdrop-blur-2xl">
                <div className="flex justify-center">
                  <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(142,176,255,0.25)] bg-[rgba(142,176,255,0.08)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#c8d6ff]">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <circle cx="5" cy="5" r="4" stroke="#c8d6ff" strokeOpacity="0.6" />
                      <path d="M5 2.5V5l1.6 1.2" stroke="#c8d6ff" strokeLinecap="round" />
                    </svg>
                    Session starts in
                  </span>
                </div>
                <p className="mt-6 text-[clamp(5rem,18vw,7rem)] font-black tabular-nums leading-none tracking-[-0.04em] text-white">
                  {formatCountdown(data.live_starts_at, nowMs)}
                </p>
                <p className="mt-3 text-[12px] font-medium uppercase tracking-[0.22em] text-[#7a94c4]">
                  Minutes &nbsp;·&nbsp; Seconds
                </p>
                <p className="mt-6 text-[15px] text-white/90">
                  Your session is about to begin, <span className="font-semibold">{firstName}</span>.
                </p>
                <p className="mt-1.5 text-[12.5px] text-[#7a94c4]">Find a quiet spot. Keep a notepad nearby.</p>
              </section>

              {/* Readiness checklist */}
              <div className="rounded-[1.25rem] border border-white/[0.07] bg-white/[0.025] p-4 backdrop-blur-xl">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#7a94c4]">Session readiness</span>
                  <span className="tabular-nums text-[11px] text-[#7a94c4]">3 of 3</span>
                </div>
                <div className="space-y-2.5">
                  {['Stable connection detected', 'Notifications muted', 'Mentor on standby'].map(txt => (
                    <div key={txt} className="flex items-center gap-2.5">
                      <div className="flex size-4 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/10">
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path d="M1.5 4l1.5 1.5L6.5 2" stroke="#22c55e" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <span className="text-[13px] text-[#b8c7e6]">{txt}</span>
                    </div>
                  ))}
                </div>
              </div>

              <JoinFeed entries={joinEntries} />
            </div>
          )}

          {/* LIVE */}
          {state === 'live' && data?.video_url && (
            <LiveSection
              videoUrl={data.video_url}
              liveStartsAt={data.live_starts_at}
              firstName={firstName}
              viewerId={prospect.viewer_id}
              sessionDay={sessionDay}
              data={data}
              joinEntries={joinEntries}
              viewerCount={viewerCount}
              prospect={prospect}
            />
          )}
          {state === 'live' && !data?.video_url && (
            <div className="w-full max-w-2xl rounded-[2.25rem] border border-white/8 bg-muted/30 px-5 py-8 text-center md:px-8 md:py-12">
              <p className="text-sm text-[#7a94c4]">Video not configured — set <code className="text-xs">premiere_video_url</code> in Settings.</p>
            </div>
          )}

          {/* ENDED */}
          {state === 'ended' && (
            <section className="w-full max-w-2xl space-y-5 text-center">
              {/* Check ring */}
              <div className="flex flex-col items-center">
                <div
                  className="flex items-center justify-center"
                  style={{
                    width: 88, height: 88, borderRadius: 999,
                    background: 'radial-gradient(circle at center, rgba(34,197,94,0.18), transparent 65%), rgba(34,197,94,0.06)',
                    border: '1px solid rgba(34,197,94,0.25)',
                    boxShadow: '0 0 60px rgba(34,197,94,0.12)',
                  }}
                >
                  <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
                    <path d="M10 19l6 6 12-12" stroke="#22c55e" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>

                <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-[rgba(142,176,255,0.25)] bg-[rgba(142,176,255,0.08)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#c8d6ff]">
                  <span className="size-1.5 rounded-full bg-[#8eb0ff]" />
                  Session complete
                </span>

                <h2 className="mt-5 text-[28px] font-bold leading-[1.15] tracking-tight text-white">
                  Today's session<br />has ended.
                </h2>
                <p className="mt-3 max-w-[300px] text-[14px] leading-relaxed text-[#7a94c4]">
                  You've taken the first step. Your mentor is ready to continue the conversation, {firstName}.
                </p>
              </div>

              {/* Mentor card */}
              <div className="rounded-[1.25rem] border border-white/[0.07] bg-white/[0.025] p-4 text-left">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Avatar name="Vikram Singh" size={48} />
                    <span className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-[#02040a] bg-emerald-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[14px] font-semibold text-white">Your assigned mentor</p>
                    <p className="mt-0.5 text-[11.5px] text-[#7a94c4]">Available now</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-emerald-400" />
                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-emerald-400">online</span>
                  </div>
                </div>
                <div className="my-4 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)]" />
                <div className="flex items-center gap-1.5 text-[11.5px] text-[#7a94c4]">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <circle cx="6" cy="6" r="5" stroke="currentColor" strokeOpacity="0.6" />
                    <path d="M6 3v3l2 1.2" stroke="currentColor" strokeOpacity="0.8" strokeLinecap="round" />
                  </svg>
                  <span>Avg response · under 4 min</span>
                </div>
              </div>

              {/* Primary CTA */}
              <button
                type="button"
                className="flex h-[54px] w-full items-center justify-center gap-2.5 rounded-2xl bg-[linear-gradient(180deg,#fafbff_0%,#e6ecf8_100%)] text-[15px] font-semibold text-[#07142e] shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_18px_40px_-16px_rgba(142,176,255,0.45)] transition hover:-translate-y-px active:translate-y-px"
                onClick={() => {
                  const msg = "Hi, I just watched the Myle session. I'm interested to know more."
                  const wa = prospect ? whatsAppChatWithTextHref(prospect.phone, msg) : null
                  if (wa && wa !== '#') window.open(wa, '_blank', 'noopener')
                }}
              >
                Talk to your mentor
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8h10m0 0L9 4m4 4L9 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {/* Ghost secondary */}
              <button
                type="button"
                className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] text-[13px] font-medium text-[#f3f7ff] transition hover:bg-white/[0.05]"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1v9m0 0L4 7m3 3l3-3M2 11v1.5h10V11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Save session notes
              </button>

              <p className="text-[11px] leading-relaxed text-[#7a94c4]">
                A private session by invitation.
              </p>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}

// Separate component so progress tracking hooks only mount during live state
function LiveSection({
  videoUrl,
  liveStartsAt,
  firstName,
  viewerId,
  sessionDay,
  data,
  joinEntries,
  viewerCount,
  prospect,
}: {
  videoUrl: string
  liveStartsAt: string
  firstName: string
  viewerId: string
  sessionDay: number
  data: PremiereData
  joinEntries: JoinEntry[]
  viewerCount: number
  prospect: { name: string; city: string; phone: string }
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const progressSentRef = useRef({ pct10: false, pct70: false, completed: false })
  const reactionIdRef = useRef(0)

  const [elapsed, setElapsed] = useState(() => {
    const diff = Date.now() - new Date(liveStartsAt).getTime()
    return Math.max(0, Math.floor(diff / 1000))
  })
  const [reactions, setReactions] = useState<{ id: number; e: string; left: number; mine: boolean }[]>([])
  const [myReactions, setMyReactions] = useState<Record<string, number>>({})
  const [lastTap, setLastTap] = useState<string | null>(null)

  // Elapsed timer
  useEffect(() => {
    const id = window.setInterval(() => setElapsed(s => s + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  // Ambient reactions from "other viewers"
  useEffect(() => {
    const emojis = ['❤️', '👏', '🔥', '💡', '🙌']
    let tid: ReturnType<typeof setTimeout>
    const scheduleNext = () => {
      tid = setTimeout(() => {
        const id = reactionIdRef.current++
        const e = emojis[Math.floor(Math.random() * emojis.length)]
        const left = 8 + Math.random() * 78
        setReactions(prev => [...prev.slice(-6), { id, e, left, mine: false }])
        scheduleNext()
      }, 900 + Math.random() * 1800)
    }
    scheduleNext()
    return () => clearTimeout(tid)
  }, [])

  function sendReaction(e: string) {
    const id = reactionIdRef.current++
    // eslint-disable-next-line react-hooks/purity
    const left = 35 + Math.random() * 30
    setReactions(prev => [...prev.slice(-6), { id, e, left, mine: true }])
    setMyReactions(prev => ({ ...prev, [e]: (prev[e] ?? 0) + 1 }))
    setLastTap(e)
    setTimeout(() => setLastTap(curr => (curr === e ? null : curr)), 320)
  }

  // Progress tracking every 25s
  useEffect(() => {
    const sessionHour = data.session_hour
    const id = window.setInterval(() => {
      const v = videoRef.current
      if (!v || !v.duration) return
      const pct = v.currentTime / v.duration
      const completed = pct >= 0.95
      void postSilent('/api/v1/other/premiere/progress', {
        viewer_id: viewerId,
        session_hour: sessionHour,
        session_day: sessionDay,
        current_time_sec: v.currentTime,
        percentage_watched: pct,
        watch_completed: completed,
      })
      if (!progressSentRef.current.pct70 && pct >= 0.70) progressSentRef.current.pct70 = true
      if (!progressSentRef.current.completed && completed) progressSentRef.current.completed = true
    }, 25_000)
    return () => window.clearInterval(id)
  }, [viewerId])

  const totalMyReactions = Object.values(myReactions).reduce((a, b) => a + b, 0)
  const elapsedMm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const elapsedSs = String(elapsed % 60).padStart(2, '0')

  return (
    <div className="w-full space-y-3">
      {/* Video player card */}
      <section className="overflow-hidden rounded-[2.1rem] border border-white/10 bg-[#070d1d] shadow-[0_38px_140px_-88px_rgba(0,0,0,0.96)]">
        <div className="relative p-3 sm:p-4">
          <PremiereVideoPlayerWithRef
            src={videoUrl}
            liveStartsAt={liveStartsAt}
            externalRef={videoRef}
          />
          {/* Floating reactions over video */}
          {reactions.map(r => (
            <span
              key={r.id}
              style={{
                position: 'absolute',
                bottom: 72,
                left: `${r.left}%`,
                opacity: 0,
                animation: 'liveBubbleUp 4s ease-out forwards',
                fontSize: r.mine ? 22 : 18,
                filter: r.mine ? 'drop-shadow(0 0 10px rgba(142,176,255,0.7))' : undefined,
                pointerEvents: 'none',
              }}
            >{r.e}</span>
          ))}
        </div>

        {/* Greeting strip */}
        <div className="mx-3 mb-3 flex items-center justify-between rounded-[1.25rem] border border-white/[0.07] bg-white/[0.025] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Avatar name={prospect.name || 'M'} size={32} />
            <div>
              <p className="text-[13.5px] font-medium text-white">You're in, {firstName} 👋</p>
              <p className="text-[11px] text-[#7a94c4]">Session is live right now</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-red-600/90 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-red-400" />
            </span>
            Live
          </span>
        </div>

        {/* Stats grid */}
        <div className="mx-3 mb-3 grid grid-cols-3 gap-2">
          {[
            [viewerCount.toLocaleString(), 'Watching'],
            [`${elapsedMm}:${elapsedSs}`, 'Elapsed'],
            ['HD', 'Quality'],
          ].map(([v, l]) => (
            <div key={l} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] px-3 py-3 text-center">
              <div className="tabular-nums text-[18px] font-semibold text-white">{v}</div>
              <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-[#7a94c4]">{l}</div>
            </div>
          ))}
        </div>

        {/* Reaction bar */}
        <div className="mx-3 mb-3 rounded-[1.25rem] border border-white/[0.07] bg-white/[0.025] px-3 py-3">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#7a94c4]">React</span>
            <span className="text-[10.5px] text-[#7a94c4]">
              {totalMyReactions > 0 ? `You sent ${totalMyReactions}` : 'Tap to show appreciation'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-1.5">
            {(['❤️', '👏', '🔥', '💡', '🙌'] as const).map(e => {
              const count = myReactions[e] ?? 0
              const popping = lastTap === e
              return (
                <button
                  key={e}
                  type="button"
                  onClick={() => sendReaction(e)}
                  className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl border py-2 transition-all duration-200 active:scale-95"
                  style={{
                    background: count > 0 ? 'rgba(142,176,255,0.07)' : 'rgba(255,255,255,0.025)',
                    borderColor: count > 0 ? 'rgba(142,176,255,0.25)' : 'rgba(255,255,255,0.07)',
                    transform: popping ? 'translateY(-2px) scale(1.06)' : undefined,
                  }}
                >
                  <span style={{
                    fontSize: 20,
                    filter: popping ? 'drop-shadow(0 4px 8px rgba(142,176,255,0.5))' : 'none',
                    transform: popping ? 'scale(1.25)' : 'scale(1)',
                    transition: 'transform 220ms cubic-bezier(.2,.7,.2,1)',
                    display: 'inline-block',
                  }}>{e}</span>
                  <span className="tabular-nums text-[10px] text-[#7a94c4]" style={{ minHeight: 12 }}>
                    {count > 0 ? count : ''}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <style>{`
        @keyframes liveBubbleUp {
          0%   { opacity: 0; transform: translateY(0) scale(0.7); }
          15%  { opacity: 1; transform: translateY(-20px) scale(1); }
          100% { opacity: 0; transform: translateY(-140px) scale(0.95); }
        }
      `}</style>

      <JoinFeed entries={joinEntries} />
    </div>
  )
}

function PremiereVideoPlayerWithRef({
  src,
  liveStartsAt,
  externalRef,
}: {
  src: string
  liveStartsAt: string
  externalRef: React.RefObject<HTMLVideoElement | null>
}) {
  const lastTimeRef = useRef(0)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(true)
  const [showCta, setShowCta] = useState(false)
  const hlsRef = useRef<{ destroy: () => void } | null>(null)

  useEffect(() => {
    const video = externalRef.current
    if (!video) return
    const isHls = src.includes('.m3u8')

    const onReady = () => {
      const offsetSec = (Date.now() - new Date(liveStartsAt).getTime()) / 1000
      const target = Math.min(Math.max(0, offsetSec), video.duration - 0.5)
      lastTimeRef.current = target
      video.currentTime = target
      video.muted = true
      void video.play().catch(() => {})
    }

    if (isHls) {
      import('hls.js').then(({ default: Hls }) => {
        if (!Hls.isSupported()) {
          video.src = src
          video.addEventListener('loadedmetadata', onReady, { once: true })
          return
        }
        const hls = new Hls()
        hlsRef.current = hls
        hls.loadSource(src)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, onReady)
      })
    } else {
      video.src = src
      video.addEventListener('loadedmetadata', onReady, { once: true })
    }

    return () => {
      hlsRef.current?.destroy()
      hlsRef.current = null
      video.removeEventListener('loadedmetadata', onReady)
    }
  }, [src, liveStartsAt, externalRef])

  function togglePlay() {
    const v = externalRef.current
    if (!v) return
    if (v.paused) void v.play()
    else void v.pause()
  }

  function unmute() {
    const v = externalRef.current
    if (!v) return
    v.muted = false
    setMuted(false)
  }

  return (
    <div className="relative bg-black" style={{ aspectRatio: '16/9' }}>
      <video
        ref={externalRef}
        className="h-full w-full rounded-[1.4rem] object-contain"
        playsInline
        muted
        disableRemotePlayback
        onContextMenu={(e) => e.preventDefault()}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onTimeUpdate={(e) => { lastTimeRef.current = e.currentTarget.currentTime }}
        onSeeking={(e) => { lastTimeRef.current = e.currentTarget.currentTime }}
        onSeeked={(e) => {
          const v = e.currentTarget
          const expectedSec = (Date.now() - new Date(liveStartsAt).getTime()) / 1000
          if (v.currentTime < expectedSec - 120 || v.currentTime > expectedSec + 30) {
            const target = Math.min(Math.max(0, expectedSec), v.duration - 0.5)
            lastTimeRef.current = target
            v.currentTime = target
          }
        }}
        onClick={togglePlay}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 rounded-t-[1.4rem] bg-gradient-to-b from-black/60 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 rounded-b-[1.4rem] bg-gradient-to-t from-black/70 to-transparent" />

      {paused && (
        <button
          type="button"
          aria-label="Play"
          className="absolute inset-0 flex items-center justify-center rounded-[1.4rem] bg-black/50"
          onClick={togglePlay}
        >
          <span className="flex size-20 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm ring-1 ring-white/20">
            <svg className="size-9 translate-x-1 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </button>
      )}

      {/* Unmute prompt — shown while video plays muted */}
      {muted && !paused && (
        <button
          type="button"
          aria-label="Unmute"
          className="absolute left-1/2 top-5 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/75 px-4 py-2 text-xs font-semibold text-white backdrop-blur-sm ring-1 ring-white/20 transition hover:bg-black/90 active:scale-95"
          onClick={unmute}
        >
          <svg className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
          </svg>
          Tap to unmute
        </button>
      )}

      <button
        type="button"
        aria-label="Fullscreen"
        className="absolute bottom-4 right-4 flex size-10 items-center justify-center rounded bg-black/60 text-white backdrop-blur-sm hover:bg-black/80"
        onClick={() => { void externalRef.current?.requestFullscreen() }}
      >
        <svg className="size-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
        </svg>
      </button>

      <button
        type="button"
        aria-label="Info"
        className="absolute bottom-4 left-4 flex size-10 items-center justify-center rounded bg-black/60 text-white backdrop-blur-sm hover:bg-black/80"
        onClick={() => setShowCta((p) => !p)}
      >
        <svg className="size-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {showCta && (
        <div className="absolute inset-x-4 bottom-16 rounded-md border border-white/10 bg-black/80 px-5 py-4 backdrop-blur-xl">
          <p className="text-sm font-semibold text-white">Ready to take the next step?</p>
          <p className="mt-1 text-xs text-[#a0b4d6]">Talk to your mentor after this session to get started.</p>
        </div>
      )}
    </div>
  )
}
