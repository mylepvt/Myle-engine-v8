import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, ShieldCheck, Trash2, Users } from 'lucide-react'

import { apiUrl } from '@/lib/api'
import { useLeadsQuery, type LeadPublic } from '@/hooks/use-leads-query'

type LinkRow = {
  token: string
  viewer_name: string | null
  title: string | null
  view_count: number
  max_views: number
  window_seconds: number
  device_locked: boolean
  opened_at: string | null
  expires_at: string | null
  created_at: string
}

const VIDEO_SRC_KEY = 'myle_enroll2_last_source'

function fullLink(token: string): string {
  return `${window.location.origin}/enroll/${token}`
}

function phoneDigits(raw: string): string {
  return raw.replace(/\D/g, '')
}

function sigFor(name: string, phone: string): string {
  return `${name.trim().toLowerCase()}|${phoneDigits(phone).slice(-10)}`
}

async function readError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}))
  if (body && typeof body === 'object' && typeof (body as { detail?: unknown }).detail === 'string') {
    return String((body as { detail: string }).detail)
  }
  return fallback
}

export function EnrollmentAdminPage({ pageTitle }: { pageTitle?: string } = {}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [videoSource, setVideoSource] = useState('')
  const [title, setTitle] = useState('Enrollment video')
  const [windowMin, setWindowMin] = useState(18)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<LinkRow[]>([])
  const [copied, setCopied] = useState<string | null>(null)
  const [lastLink, setLastLink] = useState<string | null>(null)
  const [autoNote, setAutoNote] = useState<string | null>(null)
  const [activeField, setActiveField] = useState<'name' | 'phone' | null>(null)
  const [suggestQ, setSuggestQ] = useState('')
  const lastAutoSigRef = useRef<string>('')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIDEO_SRC_KEY)
      if (saved) setVideoSource(saved)
    } catch {
      /* ignore */
    }
  }, [])

  const load = useCallback(async () => {
    const res = await fetch(apiUrl('/api/v1/enroll/links'), { credentials: 'include' })
    if (res.ok) setRows((await res.json()) as LinkRow[])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Today's claimed leads — shown below for one-tap send.
  const todayQ = useLeadsQuery(true, { q: '', status: '' }, 'active', {
    ctcsFilter: 'today',
    ctcsPrioritySort: true,
  })
  const todayLeads = todayQ.data?.items ?? []

  // Autocomplete suggestions from the user's own leads as they type name/phone.
  useEffect(() => {
    const term = activeField === 'name' ? name : activeField === 'phone' ? phone : ''
    const id = window.setTimeout(() => setSuggestQ(term.trim()), 250)
    return () => window.clearTimeout(id)
  }, [name, phone, activeField])
  const suggestionsQ = useLeadsQuery(suggestQ.length >= 2, { q: suggestQ, status: '' }, 'active')
  const suggestions = activeField ? (suggestionsQ.data?.items ?? []).slice(0, 6) : []

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(fullLink(token))
      setCopied(token)
      window.setTimeout(() => setCopied((c) => (c === token ? null : c)), 1800)
    } catch {
      setError('Could not copy — copy the link manually.')
    }
  }

  /** Create a link + copy it. Accepts explicit lead override (for clicks). */
  const createLink = useCallback(
    async (opts?: { silent?: boolean; lead?: { name: string; phone: string } }): Promise<void> => {
      const vName = (opts?.lead?.name ?? name).trim()
      const vPhone = (opts?.lead?.phone ?? phone).trim()
      setBusy(true)
      setError(null)
      try {
        const res = await fetch(apiUrl('/api/v1/enroll/generate'), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            viewer_name: vName || null,
            viewer_phone: vPhone || null,
            video_source: videoSource.trim() || null,
            title: title.trim() || null,
            window_seconds: Math.max(60, Math.round(windowMin * 60)),
            max_views: 1,
          }),
        })
        if (!res.ok) throw new Error(await readError(res, 'Could not create link.'))
        const created = (await res.json()) as LinkRow
        if (videoSource.trim()) {
          try {
            localStorage.setItem(VIDEO_SRC_KEY, videoSource.trim())
          } catch {
            /* ignore */
          }
        }
        setLastLink(fullLink(created.token))
        setAutoNote(`Link for ${vName || 'prospect'} ready & copied.`)
        await load()
        await copy(created.token)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not create link.')
        lastAutoSigRef.current = ''
      } finally {
        setBusy(false)
      }
    },
    [name, phone, videoSource, title, windowMin, load],
  )

  // Auto-generate when name + 10-digit phone present (typed manually).
  useEffect(() => {
    const digits = phoneDigits(phone)
    if (!name.trim() || digits.length < 10) return
    const sig = sigFor(name, phone)
    if (sig === lastAutoSigRef.current || busy) return
    const id = window.setTimeout(() => {
      lastAutoSigRef.current = sig
      void createLink({ silent: true })
    }, 700)
    return () => window.clearTimeout(id)
  }, [name, phone, busy, createLink])

  /** Pick a lead (from suggestion or today list) → fill + generate + copy now. */
  const pickLead = useCallback(
    (lead: LeadPublic) => {
      const ln = lead.name ?? ''
      const lp = lead.phone ?? ''
      setName(ln)
      setPhone(lp)
      setActiveField(null)
      if (phoneDigits(lp).length < 10) {
        setError('This lead has no valid 10-digit phone.')
        return
      }
      lastAutoSigRef.current = sigFor(ln, lp) // stop the auto-effect double firing
      void createLink({ lead: { name: ln, phone: lp } })
    },
    [createLink],
  )

  async function revoke(token: string) {
    if (!window.confirm('Revoke this link? It will stop working immediately.')) return
    const res = await fetch(apiUrl(`/api/v1/enroll/${token}/revoke`), {
      method: 'POST',
      credentials: 'include',
    })
    if (res.ok) await load()
  }

  const inputCls =
    'h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary'

  const SuggestList = () =>
    suggestions.length > 0 ? (
      <ul className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-border bg-card shadow-lg">
        {suggestions.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                pickLead(s)
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
            >
              <span className="truncate font-medium text-foreground">{s.name || 'No name'}</span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">{s.phone ?? '—'}</span>
            </button>
          </li>
        ))}
      </ul>
    ) : null

  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" />
          <h1 className="text-xl font-semibold">{pageTitle || 'Secure enrollment links'}</h1>
        </div>

        <div className="space-y-3 rounded-2xl border border-border bg-muted/20 p-5">
          <p className="text-xs text-muted-foreground">
            Naam ya number type karo — apne leads me se <strong>suggestion</strong> aayega, ya niche Today list se tap karo. Link{' '}
            <strong>apne aap ban ke copy</strong> ho jata. One-time · first-device lock · {windowMin}-min timer.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="relative">
              <label className="mb-1 block text-xs text-muted-foreground">Prospect name (watermark)</label>
              <input
                className={inputCls}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onFocus={() => setActiveField('name')}
                onBlur={() => window.setTimeout(() => setActiveField((f) => (f === 'name' ? null : f)), 150)}
                placeholder="Type to search your leads…"
              />
              {activeField === 'name' ? <SuggestList /> : null}
            </div>
            <div className="relative">
              <label className="mb-1 block text-xs text-muted-foreground">Prospect phone (watermark)</label>
              <input
                className={inputCls}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onFocus={() => setActiveField('phone')}
                onBlur={() => window.setTimeout(() => setActiveField((f) => (f === 'phone' ? null : f)), 150)}
                placeholder="Type number to search…"
                inputMode="numeric"
              />
              {activeField === 'phone' ? <SuggestList /> : null}
            </div>
          </div>

          {lastLink ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5">
              <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span className="min-w-0 flex-1 truncate text-xs text-foreground" title={lastLink}>{lastLink}</span>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(lastLink)
                  setAutoNote('Copied again.')
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Copy className="size-3.5" /> Copy
              </button>
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {!error && busy ? <p className="text-xs text-muted-foreground">Generating…</p> : null}
          {!error && !busy && autoNote ? <p className="text-xs text-emerald-600 dark:text-emerald-400">{autoNote}</p> : null}

          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none">Advanced (video override / title / timer)</summary>
            <div className="mt-3 space-y-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Video source (optional — defaults to Settings video)</label>
                <input className={inputCls} value={videoSource} onChange={(e) => setVideoSource(e.target.value)} placeholder="videos/enrollment/master.mp4" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Title</label>
                  <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Window (minutes)</label>
                  <input
                    className={inputCls}
                    type="number"
                    min={1}
                    max={120}
                    value={windowMin}
                    onChange={(e) => setWindowMin(Number(e.target.value) || 18)}
                  />
                </div>
              </div>
            </div>
          </details>
        </div>

        {/* Today's claimed leads — tap to send */}
        <div className="mt-6 space-y-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            <Users className="size-4" /> Today’s claimed leads — tap to send
          </h2>
          {todayQ.isPending ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : todayLeads.length === 0 ? (
            <p className="text-xs text-muted-foreground">No leads claimed today.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {todayLeads.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  disabled={busy}
                  onClick={() => pickLead(l)}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-left transition hover:border-primary/50 hover:bg-primary/5 disabled:opacity-60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">{l.name || 'No name'}</span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">{l.phone ?? 'no phone'}</span>
                  </span>
                  <Copy className="size-4 shrink-0 text-primary" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Recent generated links */}
        <div className="mt-6 space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Recent links</h2>
          {rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">No links yet.</p>
          ) : (
            rows.map((r) => (
              <div key={r.token} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.viewer_name || 'No name'} · {r.title || 'Enrollment video'}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {r.device_locked ? 'Device-locked' : 'Not opened yet'} · views {r.view_count}/{r.max_views}
                    {r.expires_at ? ` · expires ${new Date(r.expires_at).toLocaleString()}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void copy(r.token)}
                    className="inline-flex size-8 items-center justify-center rounded-md bg-muted text-foreground hover:bg-muted/70"
                    title="Copy link"
                  >
                    {copied === r.token ? <Check className="size-4 text-emerald-600 dark:text-emerald-400" /> : <Copy className="size-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => void revoke(r.token)}
                    className="inline-flex size-8 items-center justify-center rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20"
                    title="Revoke"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
