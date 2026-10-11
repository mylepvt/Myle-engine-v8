import { useState } from 'react'
import { Download } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { apiFetch } from '@/lib/api'
import { messageFromApiErrorPayload } from '@/lib/http-error-message'

type Segment = 'bad' | 'interested'

const BAD_REASONS = [
  { slug: 'not_interested', label: 'Not interested' },
  { slug: 'switch_off_unreachable', label: 'Switch off / unreachable' },
  { slug: 'wrong_number', label: 'Wrong number' },
  { slug: 'lost_dead', label: 'Lost / dead' },
] as const

/** Admin: download lead lists in Meta Ads customer-list CSV format (Custom / Lookalike audiences). */
export function MetaAudienceExportCard() {
  const [reasons, setReasons] = useState<string[]>(BAD_REASONS.map((r) => r.slug))
  const [busy, setBusy] = useState<Segment | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const toggle = (slug: string) =>
    setReasons((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]))

  async function download(segment: Segment) {
    setBusy(segment)
    setError(null)
    setMessage(null)
    let url: string | undefined
    try {
      const params = new URLSearchParams({ segment })
      if (segment === 'bad') params.set('reasons', reasons.join(','))
      const res = await apiFetch(`/api/v1/leads/export/meta-audience?${params.toString()}`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(messageFromApiErrorPayload(body, `HTTP ${res.status}`))
      }
      const blob = await res.blob()
      const rows = res.headers.get('X-Row-Count')
      const stamp = new Date().toISOString().slice(0, 10)
      url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `meta-audience-${segment}-leads-${stamp}.csv`
      link.rel = 'noopener'
      link.click()
      setMessage(rows != null ? `${rows} leads exported.` : 'Export downloaded.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed.')
    } finally {
      if (url) URL.revokeObjectURL(url)
      setBusy(null)
    }
  }

  return (
    <Card className="surface-elevated">
      <CardHeader>
        <CardTitle>Meta Ads audience export</CardTitle>
        <CardDescription>
          CSV in Meta customer-list format (phone with 91, email, name, city, gender, age). Upload in Meta Ads Manager →
          Audiences → Custom audience → Customer list. Use the poor-quality list as an <strong>exclusion</strong> audience,
          and build the <strong>Lookalike</strong> from the list of leads your team and leaders tagged Interested.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Poor-quality leads include:</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {BAD_REASONS.map((r) => (
              <label key={r.slug} className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={reasons.includes(r.slug)} onChange={() => toggle(r.slug)} />
                {r.label}
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="destructive"
            disabled={busy !== null || reasons.length === 0}
            onClick={() => void download('bad')}
          >
            <Download className="size-4" />
            {busy === 'bad' ? 'Exporting…' : 'Poor-quality leads CSV'}
          </Button>
          <Button type="button" disabled={busy !== null} onClick={() => void download('interested')}>
            <Download className="size-4" />
            {busy === 'interested' ? 'Exporting…' : 'Interested leads CSV (for Lookalike)'}
          </Button>
        </div>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
