import { useEffect, useMemo, useState } from 'react'
import { Activity, UserPlus, ArrowRightLeft, Wallet, CheckCircle2, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAdminFeedStore, type AdminActivityEntry } from '@/stores/admin-feed-store'

const ACTION_ICONS: Record<string, typeof Activity> = {
  'lead:created': UserPlus,
  'lead:transitioned': ArrowRightLeft,
  'lead_state': ArrowRightLeft,
  'lead:claimed': CheckCircle2,
  'lead:batch_claimed': CheckCircle2,
  'lead:closed': CheckCircle2,
  'lead:assigned': ArrowRightLeft,
  'wallet:credited': Wallet,
  'wallet:credited_worker': Wallet,
  'fsm:validation_failed': XCircle,
}

const ACTION_LABELS: Record<string, string> = {
  'lead:created': 'added a new lead',
  'lead:transitioned': 'moved a lead',
  'lead_state': 'changed lead stage',
  'lead:claimed': 'claimed a lead',
  'lead:batch_claimed': 'claimed batch',
  'lead:closed': 'closed a lead',
  'lead:assigned': 'assigned a lead',
  'lead:auto_reassigned': 'auto-reassigned',
  'wallet:credited': 'credited wallet',
  'wallet:credited_worker': 'credited wallet',
  'lead:claim_duplicate': 'duplicate claim',
  'fsm:validation_failed': 'stage blocked',
}

function actionIcon(action: string) {
  const Icon = ACTION_ICONS[action] ?? Activity
  return <Icon className="size-3.5 shrink-0" />
}

function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action.replace(/[:_]/g, ' ')
}

const RECENT_WINDOW_MS = 30_000 // 30 seconds = "doing now"
const ACTIVE_WINDOW_MS = 300_000 // 5 minutes = "recently active"

export function LiveTeamActivity() {
  const entries = useAdminFeedStore((s) => s.entries)

  const [now, setNow] = useState(Date.now())
  useEffect(() => { setNow(Date.now()) }, [entries])
  const { activeNow, recentActivity } = useMemo(() => {
    const grouped = new Map<string, { name: string; entries: AdminActivityEntry[]; lastSeen: number }>()

    for (const entry of entries) {
      const name = entry.actorName
      if (!name) continue
      const group = grouped.get(name) ?? { name, entries: [], lastSeen: 0 }
      group.entries.push(entry)
      group.lastSeen = Math.max(group.lastSeen, entry.timestamp)
      grouped.set(name, group)
    }

    const activeNow: Array<{ name: string; action: string; description: string; lastSeen: number }> = []
    const recentActivity: Array<{ name: string; action: string; description: string; lastSeen: number }> = []

    for (const [, group] of grouped) {
      const latest = group.entries.sort((a, b) => b.timestamp - a.timestamp)[0]
      if (!latest) continue
      const item = {
        name: group.name,
        action: latest.action,
        description: latest.description,
        lastSeen: group.lastSeen,
      }
      if (now - group.lastSeen < RECENT_WINDOW_MS) {
        activeNow.push(item)
      } else if (now - group.lastSeen < ACTIVE_WINDOW_MS) {
        recentActivity.push(item)
      }
    }

    activeNow.sort((a, b) => b.lastSeen - a.lastSeen)
    recentActivity.sort((a, b) => b.lastSeen - a.lastSeen)

    return { activeNow, recentActivity }
  }, [entries, now])

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="size-4" />
          Live Team Activity
          {activeNow.length > 0 && (
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white">
              {activeNow.length}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {activeNow.length === 0 && recentActivity.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground/50">Waiting for team activity...</p>
        ) : (
          <>
            {activeNow.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400/70">Active Now</p>
                <div className="space-y-1">
                  {activeNow.map((item) => (
                    <Link key={item.name} to="/dashboard/team/tracking" className="flex min-h-[44px] items-center gap-2 rounded px-2 py-1.5 no-underline transition-colors hover:bg-muted/30 active:bg-muted/50 cursor-pointer discord-hover">
                      <span className="relative flex size-2 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
                      </span>
                      <span className="truncate text-xs font-medium text-foreground">{item.name}</span>
                      <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                        {actionIcon(item.action)}
                        {actionLabel(item.action)}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {recentActivity.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">Recently Active</p>
                <div className="space-y-0.5">
                  {recentActivity.slice(0, 8).map((item) => (
                    <Link key={item.name} to="/dashboard/team/tracking" className="flex min-h-[44px] items-center gap-2 rounded px-2 py-1 no-underline text-[11px] text-muted-foreground/70 transition-colors hover:bg-muted/30 active:bg-muted/50 cursor-pointer">
                      <span className="size-2 shrink-0 rounded-full bg-muted-foreground/30" />
                      <span className="truncate font-medium text-muted-foreground/80">{item.name}</span>
                      <span className="truncate">{actionLabel(item.action)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
