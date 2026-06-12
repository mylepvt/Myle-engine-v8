import { CalendarDays, CheckCircle2, Phone, MessageSquare, Brain, CalendarCheck, CreditCard, Crosshair, FileText, type LucideIcon } from 'lucide-react'
import { useLeadTimeline, type TimelineEvent } from '@/hooks/use-lead-timeline-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'

const EVENT_ICONS: Record<string, LucideIcon> = {
  created: CalendarDays,
  claimed: Crosshair,
  assigned: Crosshair,
  reassigned: Crosshair,
  called: Phone,
  last_called: Phone,
  whatsapp_sent: MessageSquare,
  mindset_started: Brain,
  mindset_completed: Brain,
  day1: CalendarCheck,
  day2: CalendarCheck,
  day3: CalendarCheck,
  day4: CalendarCheck,
  day5: CalendarCheck,
  day2_test: CheckCircle2,
  day2_test_failed: Crosshair,
  payment_uploaded: CreditCard,
  sale: CheckCircle2,
  sale_pending: CreditCard,
  stage_selected: Crosshair,
  active: CheckCircle2,
  converted: CheckCircle2,
  dead: Crosshair,
  recycle: Crosshair,
  note: FileText,
  activity: FileText,
}

const EVENT_VARIANTS: Record<string, string> = {
  created: 'border-blue-200 bg-blue-50/40 dark:bg-blue-950/10',
  claimed: 'border-purple-200 bg-purple-50/40 dark:bg-purple-950/10',
  called: 'border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/10',
  whatsapp_sent: 'border-sky-200 bg-sky-50/40 dark:bg-sky-950/10',
  mindset_completed: 'border-violet-200 bg-violet-50/40 dark:bg-violet-950/10',
  day1: 'border-indigo-200 bg-indigo-50/40 dark:bg-indigo-950/10',
  day2: 'border-indigo-200 bg-indigo-50/40 dark:bg-indigo-950/10',
  day3: 'border-indigo-200 bg-indigo-50/40 dark:bg-indigo-950/10',
  day4: 'border-indigo-200 bg-indigo-50/40 dark:bg-indigo-950/10',
  day5: 'border-indigo-200 bg-indigo-50/40 dark:bg-indigo-950/10',
  day2_test: 'border-green-200 bg-green-50/40 dark:bg-green-950/10',
  day2_test_failed: 'border-red-200 bg-red-50/40 dark:bg-red-950/10',
  sale: 'border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/10',
  converted: 'border-green-200 bg-green-50/40 dark:bg-green-950/10 text-green-700 font-bold',
  dead: 'border-red-200 bg-red-50/40 dark:bg-red-950/10',
  recycle: 'border-orange-200 bg-orange-50/40 dark:bg-orange-950/10',
  note: 'border-gray-200 bg-gray-50/40 dark:bg-gray-950/10',
}

function TimelineEventRow({ event }: { event: TimelineEvent }) {
  const Icon = EVENT_ICONS[event.type] ?? FileText
  const variant = EVENT_VARIANTS[event.type] ?? 'border-border/40'
  const isOutcome = ['converted', 'dead', 'active', 'recycle'].includes(event.type)

  return (
    <div className={`flex gap-3 rounded-lg border px-3 py-2.5 ${variant} ${isOutcome ? 'ring-1 ring-inset ring-current/10' : ''}`}>
      <div className="mt-0.5 shrink-0">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold ${isOutcome ? 'text-current' : 'text-foreground'}`}>{event.label}</span>
          <span className="text-[10px] text-muted-foreground">{new Date(event.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-muted-foreground">{event.actor}</span>
          {event.detail && (
            <>
              <span className="text-[10px] text-muted-foreground/50">·</span>
              <span className="text-[11px] text-muted-foreground/70 truncate">{event.detail}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function LeadTimelineView({
  leadId,
  onClose,
}: {
  leadId: number
  onClose?: () => void
}) {
  const { data, isPending, isError, refetch } = useLeadTimeline(leadId)

  if (isPending) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </CardContent>
      </Card>
    )
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">Could not load timeline.</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => refetch()}>Retry</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold">{data.lead_name}</CardTitle>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Owner: {data.owner} · Worker: {data.assigned_to}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={data.outcome === 'converted' ? 'default' : data.outcome === 'dead' ? 'destructive' : data.outcome === 'recycle' ? 'secondary' : 'outline'}>
              {data.outcome}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">{data.events.length} events</Badge>
            {onClose && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onClose}>Close</Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {data.events.map((event, i) => (
            <TimelineEventRow key={i} event={event} />
          ))}
          {data.events.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No events recorded for this lead.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
