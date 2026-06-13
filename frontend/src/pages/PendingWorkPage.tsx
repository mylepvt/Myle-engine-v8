import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Phone, Clock, Loader2 } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyStatePremium } from '@/components/ui/empty-state-premium'
import type { LeadPublic } from '@/hooks/use-leads-query'

const PAGE_SIZE = 50

type PendingResponse = {
  items: LeadPublic[]
  total: number
}

async function fetchPendingLeads(offset: number): Promise<PendingResponse> {
  const res = await apiFetch(`/api/v1/leads/pending?limit=${PAGE_SIZE}&offset=${offset}`)
  if (!res.ok) throw new Error('Failed to fetch')
  return res.json()
}

export function PendingWorkPage({ title }: { title: string }) {
  const [page, setPage] = useState(0)
  const { data, isPending, isError } = useQuery({
    queryKey: ['leads', 'pending', page],
    queryFn: () => fetchPendingLeads(page * PAGE_SIZE),
  })

  const leads = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
        <Badge variant="secondary" className="text-xs">{total} leads needing attention</Badge>
      </div>

      {isPending && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      )}

      {isError && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">Could not load pending leads.</p>
          </CardContent>
        </Card>
      )}

      {!isPending && !isError && leads.length === 0 && (
        <EmptyStatePremium variant="default" title="All caught up!" description="No zombie or untouched leads right now." />
      )}

      {!isPending && !isError && leads.length > 0 && (
        <>
          <div className="space-y-2">
            {leads.map((lead) => (
              <div key={lead.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-card/50 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{lead.name}</p>
                    <Badge variant="outline" className="text-[10px] capitalize">{lead.status}</Badge>
                    {lead.last_action_at && (
                      <span className="text-[10px] text-red-500">Zombie</span>
                    )}
                    {!lead.last_action_at && (
                      <span className="text-[10px] text-amber-500">Untouched</span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    {lead.phone && (
                      <span className="flex items-center gap-1"><Phone className="size-3" /> {lead.phone}</span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      {lead.last_action_at
                        ? `${Math.floor((Date.now() - new Date(lead.last_action_at).getTime()) / (1000 * 60 * 60 * 24))}d since last action`
                        : `${Math.floor((Date.now() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24))}d since created`
                      }
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="size-4" /> Previous
                </Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                  Next <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
