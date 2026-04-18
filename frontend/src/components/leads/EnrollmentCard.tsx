import { type FormEvent, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useGenerateShareLinkMutation,
  useLeadShareLinksQuery,
} from '@/hooks/use-enroll-query'

type Props = {
  leadId: number
}

export function EnrollmentCard({ leadId }: Props) {
  const shareLinksQuery = useLeadShareLinksQuery(leadId)
  const generateLinkMut = useGenerateShareLinkMutation()

  const [enrollYoutubeUrl, setEnrollYoutubeUrl] = useState('')
  const [enrollTitle, setEnrollTitle] = useState('')
  const [enrollError, setEnrollError] = useState('')
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  async function handleGenerateLink(e: FormEvent) {
    e.preventDefault()
    setEnrollError('')
    try {
      await generateLinkMut.mutateAsync({
        lead_id: leadId,
        youtube_url: enrollYoutubeUrl.trim() || null,
        title: enrollTitle.trim() || null,
      })
      setEnrollYoutubeUrl('')
      setEnrollTitle('')
    } catch (err) {
      setEnrollError(err instanceof Error ? err.message : 'Could not generate link')
    }
  }

  function handleCopyLink(shareUrl: string, token: string) {
    const full = `${window.location.origin}${shareUrl}`
    void navigator.clipboard.writeText(full).then(() => {
      setCopiedToken(token)
      setTimeout(() => setCopiedToken(null), 2000)
    })
  }

  return (
    <div className="surface-elevated p-4 space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Enrollment video
        {shareLinksQuery.data && shareLinksQuery.data.total > 0 ? (
          <span className="ml-1.5 normal-case">({shareLinksQuery.data.total})</span>
        ) : null}
      </p>

      {/* Generate form */}
      <form onSubmit={(e) => void handleGenerateLink(e)} className="space-y-2">
        <input
          type="url"
          aria-label="YouTube URL (optional)"
          aria-invalid={!!enrollError}
          aria-describedby={enrollError ? 'enroll-error' : undefined}
          value={enrollYoutubeUrl}
          onChange={(e) => setEnrollYoutubeUrl(e.target.value)}
          placeholder="YouTube URL (optional)"
          className="w-full rounded-md border border-white/12 bg-white/[0.05] px-3 py-2 text-sm text-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35"
        />
        <input
          type="text"
          aria-label="Video title (optional)"
          value={enrollTitle}
          onChange={(e) => setEnrollTitle(e.target.value)}
          placeholder="Video title (optional)"
          maxLength={200}
          className="w-full rounded-md border border-white/12 bg-white/[0.05] px-3 py-2 text-sm text-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35"
        />
        {enrollError ? (
          <p id="enroll-error" className="text-xs text-destructive" role="alert">
            {enrollError}
          </p>
        ) : null}
        <Button type="submit" size="sm" disabled={generateLinkMut.isPending}>
          {generateLinkMut.isPending ? 'Generating…' : 'Generate share link'}
        </Button>
      </form>

      {/* Existing links list */}
      {shareLinksQuery.isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
        </div>
      ) : null}

      {shareLinksQuery.data && shareLinksQuery.data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No share links yet.</p>
      ) : null}

      {shareLinksQuery.data && shareLinksQuery.data.items.length > 0 ? (
        <ul className="space-y-2">
          {shareLinksQuery.data.items.map((link) => {
            const full = `${window.location.origin}${link.share_url}`
            return (
              <li key={link.id} className="surface-inset px-3 py-2 text-sm space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="text-xs font-mono text-muted-foreground break-all">{full}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {link.view_count} view{link.view_count !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="text-xs text-primary underline-offset-2 hover:underline"
                    onClick={() => handleCopyLink(link.share_url, link.token)}
                  >
                    {copiedToken === link.token ? 'Copied!' : 'Copy link'}
                  </button>
                  <a
                    href={link.share_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  >
                    Open
                  </a>
                  {link.status_synced ? (
                    <span className="text-xs text-emerald-400">Watched</span>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
