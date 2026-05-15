import { useMemo, useState } from 'react'
import { Activity, Pause, Play, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAdminFeedStore, type AdminActivityEntry } from '@/stores/admin-feed-store'

const ACTION_ICONS: Record<string, string> = {
  'commit_boundary': '↻',
  'lead:created': '+',
  'lead:transitioned': '→',
  'lead:assigned': '⇄',
  'lead:auto_reassigned': '!',
  'lead:closed': '✓',
  'lead:claimed': '⚑',
  'lead:batch_claimed': '⚑',
  'lead:claim_duplicate': '!!',
  'lead:shadow_created': 'S',
  'lead:shadow_synced': 'S',
  'lead:shadow_deleted': '✕',
  'wallet:credited': '₹',
  'wallet:credited_worker': '₹',
  'performance:recomputed': 'P',
  'system:ranking_recalc': '↑',
  'system:scheduler_tick': '⏱',
  'fsm:validation_failed': '✕',
}

// Human-readable label for each action type (shown in chips + activity row)
const ACTION_LABELS: Record<string, string> = {
  'commit_boundary': 'Lead Update',
  'lead_state': 'Stage Change',
  'lead:created': 'New Lead',
  'lead:transitioned': 'Stage Change',
  'lead:assigned': 'Assigned',
  'lead:auto_reassigned': 'Auto Reassigned',
  'lead:closed': 'Closed',
  'lead:claimed': 'Claimed',
  'lead:batch_claimed': 'Batch Claim',
  'lead:claim_duplicate': 'Duplicate Claim',
  'lead:shadow_created': 'CRM Sync',
  'lead:shadow_synced': 'CRM Sync',
  'lead:shadow_deleted': 'CRM Removed',
  'shadow_delivery': 'CRM Delivered',
  'LEAD_UPSERT': 'CRM Sync',
  'LEAD_DELETE': 'CRM Remove',
  'wallet:credited': 'Wallet Credit',
  'wallet:credited_worker': 'Wallet Credit',
  'wallet.adjustment': 'Wallet Adjust',
  'wallet.recharge_review': 'Recharge Review',
  'enrollment.link_generated': 'Enrollment Link',
  'performance:recomputed': 'Performance',
  'system:ranking_recalc': 'Ranking',
  'system:scheduler_tick': 'Scheduler',
  'fsm:validation_failed': 'Validation Error',
  'scheduler.watch_archive': 'Archive Check',
  'scheduler.failure': 'Scheduler Error',
  'scheduler.leader_enforcement': 'Leader Check',
}

function friendlyLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action]
  // Fallback: strip prefix, title-case remainder, clean underscores/dots
  const part = action.includes(':') ? action.split(':').pop()! : action
  return part.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

const SEVERITY_COLORS: Record<string, string> = {
  info: 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/40 dark:border-blue-800',
  warning: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-800',
  error: 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/40 dark:border-red-800',
}

function iconLabel(action: string): string {
  return ACTION_ICONS[action] ?? action.split(':').pop()?.slice(0, 2).toUpperCase() ?? '?'
}

function ActivityItem({ entry }: { entry: AdminActivityEntry }) {
  const style = SEVERITY_COLORS[entry.severity] ?? SEVERITY_COLORS.info
  const time = new Date(entry.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className={`flex items-start gap-2 rounded border px-3 py-2 text-xs ${style}`}>
      <span className="mt-0.5 w-6 shrink-0 text-center font-mono text-[10px] font-bold uppercase leading-tight">
        {iconLabel(entry.action)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {entry.actorName && <span className="truncate font-medium text-inherit">{entry.actorName}</span>}
          <span className="shrink-0 text-[10px] opacity-60">{friendlyLabel(entry.action)}</span>
        </div>
        <p className="mt-0.5 truncate text-[11px] opacity-80">{entry.description}</p>
      </div>
      <span className="mt-0.5 shrink-0 text-[10px] opacity-50">{time}</span>
    </div>
  )
}

export function AdminActivityPanel() {
  const entries = useAdminFeedStore((s) => s.entries)
  const unreadCount = useAdminFeedStore((s) => s.unreadCount)
  const paused = useAdminFeedStore((s) => s.paused)
  const initialized = useAdminFeedStore((s) => s.initialized)
  const setPaused = useAdminFeedStore((s) => s.setPaused)
  const markAllRead = useAdminFeedStore((s) => s.markAllRead)

  const [search, setSearch] = useState('')
  const [filterAction, setFilterAction] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let result = entries
    if (filterAction) result = result.filter((e) => e.action === filterAction)
    if (search) {
      const q = search.toLowerCase()
      result = result.filter((e) => e.description.toLowerCase().includes(q) || e.actorName?.toLowerCase().includes(q))
    }
    return result
  }, [entries, filterAction, search])

  const actionCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of entries) map.set(e.action, (map.get(e.action) ?? 0) + 1)
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10)
  }, [entries])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4" />
          <CardTitle className="text-sm">Live Activity</CardTitle>
          {unreadCount > 0 && (
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setPaused(!paused)} title={paused ? 'Resume' : 'Pause'}>
            {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={markAllRead} title="Mark all read">
            <Activity className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search activity..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded border border-input bg-background pl-7 pr-2 py-1 text-xs outline-none focus:border-primary"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {actionCounts.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {actionCounts.map(([action, count]) => (
              <button
                key={action}
                type="button"
                onClick={() => setFilterAction(filterAction === action ? null : action)}
                className={`rounded px-1.5 py-0.5 text-[10px] font-mono transition ${
                  filterAction === action ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {friendlyLabel(action)} ({count})
              </button>
            ))}
          </div>
        )}

        <div className="max-h-[400px] space-y-1.5 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              {!initialized ? 'Connecting to realtime stream...' : entries.length === 0 ? 'No activity yet' : 'No matching activity'}
            </p>
          ) : (
            filtered.slice(0, 100).map((entry) => <ActivityItem key={entry.id} entry={entry} />)
          )}
        </div>
      </CardContent>
    </Card>
  )
}
