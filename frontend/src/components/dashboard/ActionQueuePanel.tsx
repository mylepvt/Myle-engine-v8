import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Flame, MessageCircle, Megaphone, LifeBuoy } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useActionQueue,
  useExecuteQueueAction,
  type ActionKey,
  type ActionQueueItem,
} from '@/hooks/use-action-queue'
import { cn } from '@/lib/utils'

const ACTION_META: Record<ActionKey, { label: string; Icon: typeof MessageCircle }> = {
  alert_leader: { label: 'WhatsApp Leader', Icon: MessageCircle },
  create_recovery: { label: 'Recovery Mission', Icon: LifeBuoy },
  escalate: { label: 'Escalate', Icon: Megaphone },
}

const TYPE_LABEL: Record<ActionQueueItem['item_type'], string> = {
  zombie_lead: 'Zombie Lead',
  missed_missions: 'Missed Missions',
  inactive_member: 'Inactive Member',
  stuck_verification: 'Verification Stuck',
}

function severityClasses(severity: number): string {
  if (severity >= 70) return 'bg-red-500/15 text-red-600'
  if (severity >= 50) return 'bg-amber-500/15 text-amber-600'
  return 'bg-sky-500/15 text-sky-600'
}

function QueueRow({ item }: { item: ActionQueueItem }) {
  const execute = useExecuteQueueAction()
  const [lastResult, setLastResult] = useState<{ action: ActionKey; status: string } | null>(null)

  const onAction = (action: ActionKey) => {
    execute.mutate(
      { item_type: item.item_type, entity_type: item.entity_type, entity_id: item.entity_id, action },
      { onSuccess: (res) => setLastResult({ action, status: res.status }) },
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/50 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', severityClasses(item.severity))}>
            {TYPE_LABEL[item.item_type]}
          </span>
          {item.last_actioned_at && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600">
              <CheckCircle2 className="size-3" /> actioned in last 24h
            </span>
          )}
        </div>
        <p className="mt-1 truncate text-sm font-semibold text-foreground">{item.title}</p>
        <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {item.actions.map((action) => {
          const meta = ACTION_META[action]
          const done = lastResult?.action === action
          return (
            <Button
              key={action}
              size="sm"
              variant={done ? 'secondary' : 'outline'}
              className="h-7 gap-1 px-2 text-[11px]"
              disabled={execute.isPending || done}
              onClick={() => onAction(action)}
            >
              <meta.Icon className="size-3.5" />
              {done ? (lastResult.status === 'sent' || lastResult.status === 'created' || lastResult.status === 'merged' ? 'Done ✓' : lastResult.status) : meta.label}
            </Button>
          )
        })}
      </div>
    </div>
  )
}

function SummaryView({ items }: { items: ActionQueueItem[] }) {
  const groups: Record<string, { count: number; avgSeverity: number }> = {}
  for (const item of items) {
    if (!groups[item.item_type]) groups[item.item_type] = { count: 0, avgSeverity: 0 }
    groups[item.item_type].count++
    groups[item.item_type].avgSeverity += item.severity
  }
  for (const key of Object.keys(groups)) {
    groups[key].avgSeverity = Math.round(groups[key].avgSeverity / groups[key].count)
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {Object.entries(groups).map(([type, g]) => (
        <div key={type} className="rounded-lg border border-border/60 bg-card/50 p-3 text-center">
          <p className={cn('text-lg font-bold', severityClasses(g.avgSeverity))}>{g.count}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{TYPE_LABEL[type as ActionQueueItem['item_type']] ?? type}</p>
        </div>
      ))}
    </div>
  )
}

const COLLAPSED_COUNT = 3

export function ActionQueuePanel({ className, admin }: { className?: string; admin?: boolean }) {
  const { data, isPending, isError, refetch } = useActionQueue()
  const [showAll, setShowAll] = useState(false)

  if (isPending) {
    return (
      <Card className={className}>
        <CardHeader><Skeleton className="h-5 w-44" /></CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}
        </CardContent>
      </Card>
    )
  }

  if (isError || !data) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">Could not load the action queue.</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => refetch()}>Retry</Button>
        </CardContent>
      </Card>
    )
  }

  if (data.items.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center">
          <CheckCircle2 className="mx-auto size-8 text-green-500" />
          <p className="mt-2 text-sm font-semibold text-foreground">Action queue clear</p>
          <p className="mt-1 text-xs text-muted-foreground">No zombie leads, missed missions, or stuck verifications right now.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Flame className="size-4 text-red-500" />
          <CardTitle className="text-sm font-semibold">{admin ? 'Overview' : 'Do This Now'}</CardTitle>
          <Badge variant="secondary" className="text-[10px]">{data.total} items</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {admin ? (
          <SummaryView items={data.items} />
        ) : (
          <>
            {(showAll ? data.items : data.items.slice(0, COLLAPSED_COUNT)).map((item) => (
              <QueueRow key={item.id} item={item} />
            ))}
            {data.items.length > COLLAPSED_COUNT && (
              <Button
                size="sm"
                variant="ghost"
                className="w-full text-xs text-muted-foreground"
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll
                  ? 'Show less'
                  : `Show all ${data.items.length} items (${data.items.length - COLLAPSED_COUNT} more)`}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
