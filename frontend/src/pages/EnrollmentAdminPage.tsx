import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { Check, Copy, Link2, ShieldCheck, Trash2 } from 'lucide-react'

import { apiUrl } from '@/lib/api'

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
  const [windowMin, setWindowMin] = useState(16)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<LinkRow[]>([])
  const [copied, setCopied] = useState<string | null>(null)

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

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(fullLink(token))
      setCopied(token)
      window.setTimeout(() => setCopied((c) => (c === token ? null : c)), 1800)
    } catch {
      setError('Could not copy — copy the link manually.')
    }
  }

  async function generate(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(apiUrl('/api/v1/enroll/generate'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          viewer_name: name.trim() || null,
          viewer_phone: phone.trim() || null,
          video_source: videoSource.trim(),
          title: title.trim() || null,
          window_seconds: Math.max(60, Math.round(windowMin * 60)),
          max_views: 1,
        }),
      })
      if (!res.ok) throw new Error(await readError(res, 'Could not create link.'))
      const created = (await res.json()) as LinkRow
      try {
        localStorage.setItem(VIDEO_SRC_KEY, videoSource.trim())
      } catch {
        /* ignore */
      }
      setName('')
      setPhone('')
      await load()
      await copy(created.token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create link.')
    } finally {
      setBusy(false)
    }
  }

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

  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" />
          <h1 className="text-xl font-semibold">{pageTitle || 'Secure enrollment links'}</h1>
        </div>

        <form onSubmit={(e) => void generate(e)} className="space-y-3 rounded-2xl border border-border bg-muted/20 p-5">
          <p className="text-xs text-muted-foreground">
            One-time link · locks to the first device it opens on · {windowMin}-min timer starts on play. Prospect name &amp; phone
            appear as a moving watermark on the video.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Prospect name (watermark)</label>
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rahul Sharma" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Prospect phone (watermark)</label>
              <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit number" inputMode="numeric" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Video source (R2 object key or URL)</label>
            <input className={inputCls} value={videoSource} onChange={(e) => setVideoSource(e.target.value)} placeholder="videos/enrollment/master.mp4" required />
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
                onChange={(e) => setWindowMin(Number(e.target.value) || 16)}
              />
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <button
            type="submit"
            disabled={busy || !videoSource.trim()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
          >
            <Link2 className="size-4" />
            {busy ? 'Generating…' : 'Generate & copy link'}
          </button>
        </form>

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
