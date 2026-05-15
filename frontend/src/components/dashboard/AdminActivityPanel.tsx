import { useMemo, useState } from 'react'
import { Activity, Pause, Play, RefreshCw, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAdminFeedStore, type AdminActivityEntry } from '@/stores/admin-feed-store'

// ── Icon per action ──────────────────────────────────────────────────────────
const ACTION_ICONS: Record<string, string> = {
  'commit_boundary':        '↻',
  'lead_state':             '→',
  'lead:created':           '+',
  'lead:transitioned':      '→',
  'lead:assigned':          '⇄',
  'lead:auto_reassigned':   '!',
  'lead:closed':            '✓',
  'lead:claimed':           '⚑',
  'lead:batch_claimed':     '⚑',
  'lead:claim_duplicate':   '!!',
  'lead:shadow_created':    '↑',
  'lead:shadow_synced':     '↑',
  'lead:shadow_deleted':    '✕',
  'shadow_delivery':        '↑',
  'LEAD_UPSERT':            '↑',
  'LEAD_DELETE':            '✕',
  'wallet:credited':        '₹',
  'wallet:credited_worker': '₹',
  'wallet.adjustment':      '₹',
  'wallet.recharge_review': '₹',
  'enrollment.link_generated': '🔗',
  'performance:recomputed': '★',
  'system:ranking_recalc':  '↑',
  'system:scheduler_tick':  '⏱',
  'fsm:validation_failed':  '✕',
  'scheduler.failure':      '✕',
  'scheduler.watch_archive':'⏱',
  'scheduler.leader_enforcement': '⚑',
}

// ── Color per action type ────────────────────────────────────────────────────
// Each action gets: card bg tint, left border, icon pill bg, icon text, label text
type ActionColors = { bg: string; border: string; pill: string; pillText: string; tag: string }

const ACTION_COLORS: Record<string, ActionColors> = {
  // Blue — general lead update
  'commit_boundary': {
    bg: 'bg-blue-500/[0.07]', border: 'border-l-blue-500/50',
    pill: 'bg-blue-500/20', pillText: 'text-blue-300', tag: 'bg-blue-500/15 text-blue-300',
  },
  // Emerald — new lead (growth)
  'lead:created': {
    bg: 'bg-emerald-500/[0.07]', border: 'border-l-emerald-500/50',
    pill: 'bg-emerald-500/20', pillText: 'text-emerald-300', tag: 'bg-emerald-500/15 text-emerald-300',
  },
  // Violet — stage progression
  'lead:transitioned': {
    bg: 'bg-violet-500/[0.07]', border: 'border-l-violet-500/50',
    pill: 'bg-violet-500/20', pillText: 'text-violet-300', tag: 'bg-violet-500/15 text-violet-300',
  },
  'lead_state': {
    bg: 'bg-violet-500/[0.07]', border: 'border-l-violet-500/50',
    pill: 'bg-violet-500/20', pillText: 'text-violet-300', tag: 'bg-violet-500/15 text-violet-300',
  },
  // Cyan — assignment / flow
  'lead:assigned': {
    bg: 'bg-cyan-500/[0.07]', border: 'border-l-cyan-500/50',
    pill: 'bg-cyan-500/20', pillText: 'text-cyan-300', tag: 'bg-cyan-500/15 text-cyan-300',
  },
  // Orange — auto action / system reassign
  'lead:auto_reassigned': {
    bg: 'bg-orange-500/[0.07]', border: 'border-l-orange-500/50',
    pill: 'bg-orange-500/20', pillText: 'text-orange-300', tag: 'bg-orange-500/15 text-orange-300',
  },
  // Green — closed / done
  'lead:closed': {
    bg: 'bg-green-500/[0.07]', border: 'border-l-green-500/50',
    pill: 'bg-green-500/20', pillText: 'text-green-300', tag: 'bg-green-500/15 text-green-300',
  },
  // Indigo — claimed / ownership
  'lead:claimed': {
    bg: 'bg-indigo-500/[0.07]', border: 'border-l-indigo-500/50',
    pill: 'bg-indigo-500/20', pillText: 'text-indigo-300', tag: 'bg-indigo-500/15 text-indigo-300',
  },
  'lead:batch_claimed': {
    bg: 'bg-indigo-500/[0.07]', border: 'border-l-indigo-500/50',
    pill: 'bg-indigo-500/20', pillText: 'text-indigo-300', tag: 'bg-indigo-500/15 text-indigo-300',
  },
  // Rose — duplicate / conflict
  'lead:claim_duplicate': {
    bg: 'bg-rose-500/[0.07]', border: 'border-l-rose-500/50',
    pill: 'bg-rose-500/20', pillText: 'text-rose-300', tag: 'bg-rose-500/15 text-rose-300',
  },
  // Sky — data sync
  'lead:shadow_created': {
    bg: 'bg-sky-500/[0.07]', border: 'border-l-sky-500/50',
    pill: 'bg-sky-500/20', pillText: 'text-sky-300', tag: 'bg-sky-500/15 text-sky-300',
  },
  'lead:shadow_synced': {
    bg: 'bg-sky-500/[0.07]', border: 'border-l-sky-500/50',
    pill: 'bg-sky-500/20', pillText: 'text-sky-300', tag: 'bg-sky-500/15 text-sky-300',
  },
  'shadow_delivery': {
    bg: 'bg-sky-500/[0.07]', border: 'border-l-sky-500/50',
    pill: 'bg-sky-500/20', pillText: 'text-sky-300', tag: 'bg-sky-500/15 text-sky-300',
  },
  'LEAD_UPSERT': {
    bg: 'bg-sky-500/[0.07]', border: 'border-l-sky-500/50',
    pill: 'bg-sky-500/20', pillText: 'text-sky-300', tag: 'bg-sky-500/15 text-sky-300',
  },
  'lead:shadow_deleted': {
    bg: 'bg-red-500/[0.07]', border: 'border-l-red-500/50',
    pill: 'bg-red-500/20', pillText: 'text-red-300', tag: 'bg-red-500/15 text-red-300',
  },
  'LEAD_DELETE': {
    bg: 'bg-red-500/[0.07]', border: 'border-l-red-500/50',
    pill: 'bg-red-500/20', pillText: 'text-red-300', tag: 'bg-red-500/15 text-red-300',
  },
  // Amber — wallet / money
  'wallet:credited': {
    bg: 'bg-amber-500/[0.07]', border: 'border-l-amber-500/50',
    pill: 'bg-amber-500/20', pillText: 'text-amber-300', tag: 'bg-amber-500/15 text-amber-300',
  },
  'wallet:credited_worker': {
    bg: 'bg-amber-500/[0.07]', border: 'border-l-amber-500/50',
    pill: 'bg-amber-500/20', pillText: 'text-amber-300', tag: 'bg-amber-500/15 text-amber-300',
  },
  'wallet.adjustment': {
    bg: 'bg-amber-500/[0.07]', border: 'border-l-amber-500/50',
    pill: 'bg-amber-500/20', pillText: 'text-amber-300', tag: 'bg-amber-500/15 text-amber-300',
  },
  'wallet.recharge_review': {
    bg: 'bg-amber-500/[0.07]', border: 'border-l-amber-500/50',
    pill: 'bg-amber-500/20', pillText: 'text-amber-300', tag: 'bg-amber-500/15 text-amber-300',
  },
  // Teal — enrollment
  'enrollment.link_generated': {
    bg: 'bg-teal-500/[0.07]', border: 'border-l-teal-500/50',
    pill: 'bg-teal-500/20', pillText: 'text-teal-300', tag: 'bg-teal-500/15 text-teal-300',
  },
  // Teal — performance
  'performance:recomputed': {
    bg: 'bg-teal-500/[0.07]', border: 'border-l-teal-500/50',
    pill: 'bg-teal-500/20', pillText: 'text-teal-300', tag: 'bg-teal-500/15 text-teal-300',
  },
  // Pink — ranking
  'system:ranking_recalc': {
    bg: 'bg-pink-500/[0.07]', border: 'border-l-pink-500/50',
    pill: 'bg-pink-500/20', pillText: 'text-pink-300', tag: 'bg-pink-500/15 text-pink-300',
  },
  // Red — errors / blocked
  'fsm:validation_failed': {
    bg: 'bg-red-500/[0.07]', border: 'border-l-red-500/50',
    pill: 'bg-red-500/20', pillText: 'text-red-300', tag: 'bg-red-500/15 text-red-300',
  },
  'scheduler.failure': {
    bg: 'bg-red-500/[0.07]', border: 'border-l-red-500/50',
    pill: 'bg-red-500/20', pillText: 'text-red-300', tag: 'bg-red-500/15 text-red-300',
  },
  // Slate — system / auto tasks (neutral)
  'system:scheduler_tick': {
    bg: 'bg-slate-500/[0.05]', border: 'border-l-slate-500/30',
    pill: 'bg-slate-500/15', pillText: 'text-slate-400', tag: 'bg-slate-500/10 text-slate-400',
  },
  'scheduler.watch_archive': {
    bg: 'bg-slate-500/[0.05]', border: 'border-l-slate-500/30',
    pill: 'bg-slate-500/15', pillText: 'text-slate-400', tag: 'bg-slate-500/10 text-slate-400',
  },
  'scheduler.leader_enforcement': {
    bg: 'bg-slate-500/[0.05]', border: 'border-l-slate-500/30',
    pill: 'bg-slate-500/15', pillText: 'text-slate-400', tag: 'bg-slate-500/10 text-slate-400',
  },
}

const DEFAULT_COLORS: ActionColors = {
  bg: 'bg-blue-500/[0.06]', border: 'border-l-blue-500/40',
  pill: 'bg-blue-500/15', pillText: 'text-blue-300', tag: 'bg-blue-500/10 text-blue-300',
}

function getActionColors(action: string): ActionColors {
  return ACTION_COLORS[action] ?? DEFAULT_COLORS
}

// ── Human-readable labels ────────────────────────────────────────────────────
const ACTION_LABELS: Record<string, string> = {
  'commit_boundary':            'Lead Update',
  'lead_state':                 'Stage Change',
  'lead:created':               'New Lead',
  'lead:transitioned':          'Stage Change',
  'lead:assigned':              'Assigned',
  'lead:auto_reassigned':       'Auto Reassigned',
  'lead:closed':                'Closed',
  'lead:claimed':               'Claimed',
  'lead:batch_claimed':         'Batch Claim',
  'lead:claim_duplicate':       'Duplicate Claim',
  'lead:shadow_created':        'Data Saved',
  'lead:shadow_synced':         'Data Saved',
  'lead:shadow_deleted':        'Data Removed',
  'shadow_delivery':            'Data Updated',
  'LEAD_UPSERT':                'Data Saved',
  'LEAD_DELETE':                'Data Removed',
  'wallet:credited':            'Points Added',
  'wallet:credited_worker':     'Points Added',
  'wallet.adjustment':          'Points Adjusted',
  'wallet.recharge_review':     'Payment Review',
  'enrollment.link_generated':  'Join Link',
  'performance:recomputed':     'Score Updated',
  'system:ranking_recalc':      'Ranking Updated',
  'system:scheduler_tick':      'Auto Task',
  'fsm:validation_failed':      'Stage Blocked',
  'scheduler.watch_archive':    'Auto Cleanup',
  'scheduler.failure':          'Task Failed',
  'scheduler.leader_enforcement': 'Leader Check',
}

function friendlyLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action]
  const part = action.includes(':') ? action.split(':').pop()! : action
  return part.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function iconLabel(action: string): string {
  return ACTION_ICONS[action] ?? action.split(':').pop()?.slice(0, 2).toUpperCase() ?? '?'
}

// ── Activity row ─────────────────────────────────────────────────────────────
function ActivityItem({ entry }: { entry: AdminActivityEntry }) {
  const c = getActionColors(entry.action)
  const time = new Date(entry.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className={`flex items-start gap-2.5 rounded-lg border-l-[3px] px-3 py-2.5 transition-all ${c.bg} ${c.border}`}>
      {/* colored icon pill */}
      <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${c.pill} ${c.pillText}`}>
        {iconLabel(entry.action)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {entry.actorName && (
            <span className="text-[12px] font-semibold text-foreground/90">{entry.actorName}</span>
          )}
          <span className={`rounded px-1.5 py-0 text-[10px] font-medium leading-5 ${c.tag}`}>
            {friendlyLabel(entry.action)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground/65">{entry.description}</p>
      </div>

      <span className="mt-0.5 shrink-0 text-[10px] tabular-nums text-muted-foreground/40">{time}</span>
    </div>
  )
}

// ── Filter chip ──────────────────────────────────────────────────────────────
function FilterChip({ action, count, active, onClick }: { action: string; count: number; active: boolean; onClick: () => void }) {
  const c = getActionColors(action)
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-all ${
        active ? `${c.pill} ${c.pillText} ring-1 ring-inset ${c.border.replace('border-l-', 'ring-')}` : 'bg-muted/40 text-muted-foreground hover:bg-muted/60'
      }`}
    >
      {friendlyLabel(action)} <span className="opacity-60">{count}</span>
    </button>
  )
}

// ── Panel ────────────────────────────────────────────────────────────────────
export function AdminActivityPanel() {
  const entries = useAdminFeedStore((s) => s.entries)
  const unreadCount = useAdminFeedStore((s) => s.unreadCount)
  const paused = useAdminFeedStore((s) => s.paused)
  const initialized = useAdminFeedStore((s) => s.initialized)
  const setPaused = useAdminFeedStore((s) => s.setPaused)
  const markAllRead = useAdminFeedStore((s) => s.markAllRead)
  const refresh = useAdminFeedStore((s) => s.refresh)

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
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={refresh} title="Refresh">
            <RefreshCw className="h-3 w-3" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={markAllRead} title="Mark all read">
            <Activity className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/50" />
          <input
            type="text"
            placeholder="Search activity..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-input/60 bg-muted/20 pl-7 pr-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground/40 focus:border-primary/40 focus:bg-muted/30"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Filter chips */}
        {actionCounts.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {actionCounts.map(([action, count]) => (
              <FilterChip
                key={action}
                action={action}
                count={count}
                active={filterAction === action}
                onClick={() => setFilterAction(filterAction === action ? null : action)}
              />
            ))}
          </div>
        )}

        {/* Feed */}
        <div className="max-h-[400px] space-y-1.5 overflow-y-auto pr-0.5">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground/50">
              {!initialized ? 'Connecting to live stream...' : entries.length === 0 ? 'No activity yet' : 'No matching activity'}
            </p>
          ) : (
            filtered.slice(0, 100).map((entry) => <ActivityItem key={entry.id} entry={entry} />)
          )}
        </div>
      </CardContent>
    </Card>
  )
}
