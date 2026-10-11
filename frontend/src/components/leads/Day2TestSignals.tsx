import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Download, ShieldCheck } from 'lucide-react'

import { apiFetch } from '@/lib/api'
import { downloadApiPdf, pdfFileSlug } from '@/lib/download-pdf'
import { cn } from '@/lib/utils'

type Day2Result = {
  status: 'active' | 'submitted'
  score: number | null
  total: number
  passed: boolean | null
  duration_seconds: number | null
  tab_switches: number
  app_hidden: number
  copy_count: number
  paste_count: number
  suspicious: boolean
  flags: string[]
}

function formatDuration(seconds: number | null): string | null {
  if (seconds == null) return null
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m} min ${s} s` : `${s} s`
}

/**
 * Cheat signals recorded during the prospect's Day 2 test (leader/admin only — the
 * endpoint returns 403 for team members, in which case nothing is shown).
 */
export function Day2TestSignals({
  leadId,
  status,
  leadName,
}: {
  leadId: number
  status: string
  leadName?: string
}) {
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const enabled = status === 'in_progress' || status === 'passed' || status === 'failed'
  const q = useQuery({
    queryKey: ['leads', leadId, 'day2-test-result', status],
    enabled,
    retry: false,
    staleTime: 30_000,
    queryFn: async (): Promise<Day2Result | null> => {
      const res = await apiFetch(`/api/v1/leads/${leadId}/day2-test-result`)
      if (!res.ok) return null
      const body = (await res.json()) as { result: Day2Result | null }
      return body.result
    },
  })
  const r = q.data
  if (!enabled || !r) return null

  const focusLosses = r.tab_switches + r.app_hidden
  const time = formatDuration(r.duration_seconds)
  return (
    <div
      className={cn(
        'rounded-lg border px-2.5 py-2 text-ds-caption',
        r.suspicious ? 'border-warning/40 bg-warning/10' : 'border-border/50 bg-muted/30',
      )}
    >
      <div className="flex items-center gap-1.5 font-semibold">
        {r.suspicious ? (
          <AlertTriangle className="h-3.5 w-3.5 text-warning-ink" aria-hidden />
        ) : (
          <ShieldCheck className="h-3.5 w-3.5 text-success-ink" aria-hidden />
        )}
        <span className={r.suspicious ? 'text-warning-ink' : 'text-foreground'}>
          {r.suspicious ? 'Suspicious attempt — check with the prospect' : 'No cheating signals'}
        </span>
      </div>
      <p className="mt-1 text-muted-foreground">
        Screen left: {focusLosses} · Copy: {r.copy_count} · Paste: {r.paste_count}
        {time ? ` · Time taken: ${time}` : ''}
      </p>
      {r.flags.length > 0 ? (
        <ul className="mt-1 list-disc pl-4 text-warning-ink">
          {r.flags.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      ) : null}
      {r.status === 'submitted' && r.passed ? (
        <>
          <button
            type="button"
            disabled={downloading}
            onClick={() => {
              setDownloading(true)
              setDownloadError(null)
              void downloadApiPdf(
                `/api/v1/leads/${leadId}/day2-test-certificate`,
                `day2_certificate_${pdfFileSlug(leadName ?? String(leadId))}.pdf`,
              )
                .catch((e: unknown) =>
                  setDownloadError(e instanceof Error ? e.message : 'Download failed'),
                )
                .finally(() => setDownloading(false))
            }}
            className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-success/40 bg-success/10 text-ds-caption font-semibold text-success-ink transition hover:bg-success/20 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            {downloading ? 'Downloading…' : 'Download certificate'}
          </button>
          {downloadError ? <p className="mt-1 text-destructive">{downloadError}</p> : null}
        </>
      ) : null}
    </div>
  )
}
