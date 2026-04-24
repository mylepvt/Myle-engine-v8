import { useState } from 'react'
import { MessageCircle, ShieldCheck, TimerReset } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useLeadShareLinksQuery,
  useSendEnrollmentVideoMutation,
} from '@/hooks/use-enroll-query'
import {
  openExternalShareUrl,
} from '@/lib/external-share-window'

type Props = {
  leadId: number
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

function shareLinkState(link: {
  status_synced: boolean
  is_expired: boolean
  first_viewed_at: string | null
}): {
  label: string
  className: string
} {
  if (link.status_synced) {
    return {
      label: 'Watched',
      className: 'rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300',
    }
  }
  if (link.is_expired) {
    return {
      label: 'Expired',
      className: 'rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300',
    }
  }
  if (link.first_viewed_at) {
    return {
      label: 'Started',
      className: 'rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-300',
    }
  }
  return {
    label: 'Active',
    className: 'rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-300',
  }
}

export function EnrollmentCard({ leadId }: Props) {
  const shareLinksQuery = useLeadShareLinksQuery(leadId)
  const sendMut = useSendEnrollmentVideoMutation()
  const [actionError, setActionError] = useState('')
  const [actionHint, setActionHint] = useState('')
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  async function handleSend() {
    setActionError('')
    setActionHint('')
    try {
      const result = await sendMut.mutateAsync(leadId)
      const manualUrl = result.delivery.manual_share_url?.trim()
      openExternalShareUrl(manualUrl)
      setActionHint(
        result.delivery.channel === 'whatsapp_webhook'
          ? 'Secure enrollment video WhatsApp par bhej diya gaya.'
          : 'Secure private room ready hai. WhatsApp share window bhi open kar di gayi hai.',
      )
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not send enrollment video')
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
    <div className="surface-elevated space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Secure enrollment video</p>
          <h3 className="mt-1 text-sm font-semibold text-foreground">Private 30-minute in-app watch room</h3>
        </div>
        <div className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
          Sensitive flow
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <ShieldCheck className="size-4 text-cyan-300" />
          <p className="mt-2 text-xs font-semibold text-foreground">Phone locked</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Link sirf lead ke registered number se unlock hota hai.
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <TimerReset className="size-4 text-amber-300" />
          <p className="mt-2 text-xs font-semibold text-foreground">30-minute expiry</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Har naya send purane active links ko immediately expire kar deta hai.
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <MessageCircle className="size-4 text-emerald-300" />
          <p className="mt-2 text-xs font-semibold text-foreground">WhatsApp delivery</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Lead ko raw video URL nahi, sirf private Myle room link milta hai.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" disabled={sendMut.isPending} onClick={() => void handleSend()}>
          {sendMut.isPending ? 'Sending…' : 'Send secure enrollment video'}
        </Button>
        {actionHint ? <p className="text-xs text-emerald-400">{actionHint}</p> : null}
        {actionError ? (
          <p className="text-xs text-destructive" role="alert">
            {actionError}
          </p>
        ) : null}
      </div>

      {shareLinksQuery.isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : null}

      {shareLinksQuery.data && shareLinksQuery.data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Abhi tak koi secure enrollment link send nahi hua. Admin ko `Settings → General → Enrollment Video` me
          direct hosted video source set rakhna chahiye.
        </p>
      ) : null}

      {shareLinksQuery.data && shareLinksQuery.data.items.length > 0 ? (
        <ul className="space-y-2">
          {shareLinksQuery.data.items.map((link) => {
            const state = shareLinkState(link)
            return (
              <li key={link.id} className="surface-inset space-y-2 px-3 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-foreground">{link.title || 'Enrollment video'}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Sent {formatDateTime(link.created_at)} · Expires {formatDateTime(link.expires_at)}
                    </p>
                    {link.first_viewed_at ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Started {formatDateTime(link.first_viewed_at)}
                      </p>
                    ) : null}
                  </div>
                  <span className={state.className}>{state.label}</span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <button
                    type="button"
                    className="text-primary underline-offset-2 hover:underline"
                    onClick={() => handleCopyLink(link.share_url, link.token)}
                  >
                    {copiedToken === link.token ? 'Copied!' : 'Copy private room link'}
                  </button>
                  <a
                    href={link.share_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground underline-offset-2 hover:underline"
                  >
                    Open room
                  </a>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
