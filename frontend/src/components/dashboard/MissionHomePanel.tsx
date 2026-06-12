import { useState } from 'react'
import { AlertCircle, CheckCircle2, ListChecks, Send } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useTodayMission,
  useTickMission,
  useCompleteMission,
  useReportBlocker,
  type MissionItemData,
} from '@/hooks/use-missions-query'

const BLOCKER_OPTIONS = [
  { value: 'fear', label: 'Fear' },
  { value: 'no_prospects', label: 'No Prospects' },
  { value: 'no_time', label: 'No Time' },
  { value: 'technical_issue', label: 'Technical Issue' },
  { value: 'didnt_understand', label: "Didn't Understand" },
  { value: 'other', label: 'Other' },
]

function MissionItemRow({
  itemKey,
  item,
  onTick,
  ticking,
}: {
  itemKey: string
  item: MissionItemData
  onTick: (achieved: number, evidence?: string) => void
  ticking: boolean
}) {
  const [achieved, setAchieved] = useState(item.achieved)
  const [evidence, setEvidence] = useState('')

  if (item.done) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/5 p-2.5">
        <CheckCircle2 className="size-4 shrink-0 text-success" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{item.label}</p>
          <p className="text-xs text-muted-foreground">
            {item.achieved}/{item.target} · {item.evidence ?? item.evidence_file ?? 'Done'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-md border border-border/60 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{item.label}</p>
        <Badge variant="outline">{item.achieved}/{item.target}</Badge>
      </div>

      {item.target > 1 && (
        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.min(100, (item.achieved / item.target) * 100)}%` }}
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={item.target}
            value={achieved}
            onChange={e => setAchieved(Number(e.target.value))}
            className="w-16 rounded border px-2 py-1 text-xs"
          />
          <input
            placeholder="Evidence (optional)"
            value={evidence}
            onChange={e => setEvidence(e.target.value)}
            className="min-w-0 flex-1 rounded border px-2 py-1 text-xs"
          />
          <Button
            size="sm"
            disabled={ticking || achieved < 0}
            onClick={() => onTick(achieved, evidence.trim() || undefined)}
          >
            {ticking ? '...' : 'Tick'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function MissionHomePanel() {
  const mission = useTodayMission()
  const tickMutation = useTickMission()
  const completeMutation = useCompleteMission()
  const blockerMutation = useReportBlocker()

  const [showBlocker, setShowBlocker] = useState(false)
  const [blockerReason, setBlockerReason] = useState('')
  const [blockerNotes, setBlockerNotes] = useState('')

  if (mission.isPending) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <ListChecks className="size-4" />Today's Mission
        </CardTitle></CardHeader>
        <CardContent><Skeleton className="h-20 w-full" /></CardContent>
      </Card>
    )
  }

  if (mission.isError || !mission.data) return null

  const { items, completion_pct, status } = mission.data
  const itemEntries = Object.entries(items as Record<string, MissionItemData>).filter(([, v]) => v)

  if (itemEntries.length === 0) return null

  const allDone = itemEntries.every(([, item]) => item.done)
  const isCompleted = status === 'completed'

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <ListChecks className="size-4 text-primary" />
            Today's Mission
          </CardTitle>
          <CardDescription className="text-xs">Daily tasks to complete</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{completion_pct}%</span>
          <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${completion_pct}%` }}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {itemEntries.map(([key, item]) => (
          <MissionItemRow
            key={key}
            itemKey={key}
            item={item}
            onTick={(achieved, evidence) =>
              tickMutation.mutate({ itemKey: key, achieved, evidence })
            }
            ticking={tickMutation.isPending}
          />
        ))}

        <div className="flex flex-wrap gap-2 pt-1">
          {allDone && !isCompleted && (
            <Button
              size="sm"
              disabled={completeMutation.isPending}
              onClick={() => completeMutation.mutate()}
            >
              <CheckCircle2 className="mr-1 size-3" />
              {completeMutation.isPending ? 'Completing...' : 'Complete Mission'}
            </Button>
          )}

          {!isCompleted && (
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => setShowBlocker(!showBlocker)}
            >
              <AlertCircle className="mr-1 size-3" />
              Can't Complete
            </Button>
          )}

          {isCompleted && (
            <div className="flex items-center gap-1.5 text-xs text-success">
              <CheckCircle2 className="size-3" />
              Completed
            </div>
          )}
        </div>

        {showBlocker && (
          <div className="flex flex-col gap-2 rounded-md border border-warning/30 bg-warning/5 p-3">
            <select
              className="rounded border p-2 text-xs"
              value={blockerReason}
              onChange={e => setBlockerReason(e.target.value)}
            >
              <option value="">Select reason...</option>
              {BLOCKER_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <textarea
              className="min-h-[50px] w-full resize-none rounded border p-2 text-xs"
              placeholder="Additional notes..."
              value={blockerNotes}
              onChange={e => setBlockerNotes(e.target.value)}
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={!blockerReason || blockerMutation.isPending}
              onClick={() => {
                blockerMutation.mutate({ reason: blockerReason, notes: blockerNotes })
                setShowBlocker(false)
                setBlockerReason('')
                setBlockerNotes('')
              }}
            >
              <Send className="mr-1 size-3" />
              {blockerMutation.isPending ? 'Submitting...' : 'Report Blocker'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
