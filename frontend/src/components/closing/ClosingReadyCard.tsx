import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Handshake } from 'lucide-react'

import { LeadContactActions } from '@/components/leads/LeadContactActions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch } from '@/lib/api'

type ClosingItem = {
  lead_id: number
  name: string
  phone: string | null
  city: string | null
  owner_name: string | null
  assigned_name: string | null
  interview_at: string | null
  session_watched_at: string
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

/**
 * Admin + leaders: today's closing list — Day 3 prospects who finished the interview
 * and watched today's 2 PM live session. Call or WhatsApp them straight from here.
 */
export function ClosingReadyCard() {
  const { data, isPending, isError } = useQuery<{ items: ClosingItem[] }>({
    queryKey: ['closing', 'today'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/closing/today')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
  const items = data?.items ?? []

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-ds-h3">
          <span className="flex items-center gap-2">
            <Handshake className="size-4 text-success-ink" aria-hidden />
            Ready for closing today
          </span>
          {items.length ? (
            <span className="rounded-full bg-success/15 px-2 py-0.5 text-ds-caption font-semibold text-success-ink">
              {items.length}
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : isError ? (
          <p className="text-ds-caption text-muted-foreground">Closing list is unavailable right now.</p>
        ) : !items.length ? (
          <p className="text-ds-caption text-muted-foreground">
            Nobody yet. Prospects appear here once their interview is done and they watched today&apos;s 2 PM
            session (tick it on the Day 3 card).
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {items.map((p) => (
              <li key={p.lead_id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/dashboard/work/leads/${p.lead_id}`}
                    className="block truncate text-sm font-semibold text-foreground hover:underline"
                  >
                    {p.name}
                  </Link>
                  <p className="truncate text-ds-caption text-muted-foreground">
                    {p.phone ?? 'No phone'}
                    {p.owner_name ? ` · ${p.owner_name}` : ''} · session {time(p.session_watched_at)}
                  </p>
                </div>
                <LeadContactActions phone={p.phone} size="sm" />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
