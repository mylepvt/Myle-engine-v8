import { useState } from 'react'
import { useLeadsQuery, type LeadPublic } from '@/hooks/use-leads-query'
import { ChevronLeft, ChevronRight, Phone, MessageCircle, Clock, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyStatePremium } from '@/components/ui/empty-state-premium'

const PAGE_SIZE = 50

export function PendingWorkPage({ title }: { title: string }) {
  const [page, setPage] = useState(0)
  const { data, isPending, isError } = useLeadsQuery(true, { limit: PAGE_SIZE, offset: page * PAGE_SIZE })

  const leads = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
        <Badge variant="secondary" className="text-xs">{total} leads</Badge>
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
            <p className="text-sm text-muted-foreground">Could not load leads.</p>
          </CardContent>
        </Card>
      )}

      {!isPending && !isError && leads.length === 0 && (
        <EmptyStatePremium variant="default" title="No pending work" description="All leads are up to date!" />
      )}

      {!isPending && !isError && leads.length > 0 && (
        <>
          <div className="space-y-2">
            {leads.map((lead) => (
              <LeadRow key={lead.id} lead={lead} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="size-4" /> Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
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

function LeadRow({ lead }: { lead: LeadPublic }) {
  const daysSinceAction = lead.last_action_at
    ? Math.floor((Date.now() - new Date(lead.last_action_at).getTime()) / (1000 * 60 * 60 * 24))
    : null

  return (
    <div className="flex items-center justify-between rounded-lg border border-border/60 bg-card/50 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{lead.name}</p>
          <Badge variant="outline" className="text-[10px] capitalize">{lead.status}</Badge>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {lead.phone && (
            <span className="flex items-center gap-1">
              <Phone className="size-3" /> {lead.phone}
            </span>
          )}
          {daysSinceAction !== null && (
            <span className="flex items-center gap-1">
              <Clock className="size-3" /> {daysSinceAction}d since last action
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
