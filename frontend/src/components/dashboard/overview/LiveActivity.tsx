import { useMemo, useState } from 'react'
import { Zap } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { useAdminFeedStore, type AdminActivityEntry } from '@/stores/admin-feed-store'

type Kind = 'new' | 'claim' | 'conversion' | 'money' | 'handoff' | 'stage'

const ICONS: Record<Kind, string> = {
  new: '✨',
  claim: '🙋',
  conversion: '🏆',
  money: '💰',
  handoff: '🔄',
  stage: '📌',
}

const COLORS: Record<Kind, { box: string; boxText: string; chip: string }> = {
  new:        { box: 'bg-blue-500/15', boxText: 'text-blue-400', chip: 'text-blue-400' },
  claim:      { box: 'bg-amber-500/15', boxText: 'text-amber-400', chip: 'text-amber-400' },
  conversion: { box: 'bg-emerald-500/15', boxText: 'text-emerald-400', chip: 'text-emerald-400' },
  money:      { box: 'bg-violet-500/15', boxText: 'text-violet-400', chip: 'text-violet-400' },
  handoff:    { box: 'bg-indigo-500/15', boxText: 'text-indigo-400', chip: 'text-indigo-400' },
  stage:      { box: 'bg-muted', boxText: 'text-muted-foreground', chip: 'text-muted-foreground' },
}

function classify(action: string): Kind | null {
  if (action === 'lead:created') return 'new'
  if (action === 'lead:claimed' || action === 'lead:batch_claimed') return 'claim'
  if (action === 'lead:closed') return 'conversion'
  if (action.startsWith('wallet')) return 'money'
  if (action === 'lead:assigned' || action === 'lead:auto_reassigned') return 'handoff'
  if (action === 'lead:transitioned' || action === 'lead_state' || action === 'commit_boundary') return 'stage'
  return null
}

function computePulse(items: { e: AdminActivityEntry; kind: Kind }[]) {
  const since = Date.now() - 3_600_000
  const recent = items.filter((x) => x.e.timestamp >= since)
  const by = (k: Kind) => recent.filter((x) => x.kind === k).length
  return {
    total: recent.length,
    newLeads: by('new'),
    claims: by('claim'),
    conversions: by('conversion'),
    money: by('money'),
  }
}

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 10) return 'now'
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.round(h / 24)}d`
}

function cleanDesc(kind: Kind, desc: string): string {
  if (kind === 'new') {
    const m = desc.match(/New lead added:?\s*(.*)/i)
    return m ? `added ${m[1]}` : desc
  }
  if (kind === 'claim') {
    const m = desc.match(/(.*?)\s*claimed/i)
    return m ? `claimed ${m[1]}` : desc
  }
  if (kind === 'conversion') {
    const m = desc.match(/(.*?)\s*closed/i)
    return m ? `converted ${m[1]}` : desc
  }
  if (kind === 'money') {
    const m = desc.match(/Wallet credited for\s*(.*)/i)
    if (m) return `earned commission — ${m[1]}`
    return desc
  }
  if (kind === 'handoff') {
    const m = desc.match(/(.*?)\s*auto-reassigned/i)
    if (m) return `reassigned ${m[1]}`
    const n = desc.match(/(.*?)\s*assigned/i)
    if (n) return `assigned ${n[1]}`
    return desc
  }
  if (kind === 'stage') {
    const m = desc.match(/(.*?)\s*moved to\s*(.*)/i)
    if (m) return `${m[1]} → ${m[2]}`
    return desc
  }
  return desc
}

function Metric({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className="flex-1 rounded-xl bg-muted px-3 py-3 text-center">
      <p className={cn('text-xl font-bold tabular-nums', cls)}>{value}</p>
      <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.03em] text-muted-foreground">{label}</p>
    </div>
  )
}

function Row({ entry, kind }: { entry: AdminActivityEntry; kind: Kind }) {
  const c = COLORS[kind]
  const icon = ICONS[kind]
  const desc = cleanDesc(kind, entry.description)

  return (
    <div className="flex items-start gap-3 border-b border-border/50 px-5 py-3 transition-colors hover:bg-muted/40">
      <span
        className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg text-sm font-medium', c.box, c.boxText)}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm leading-snug text-foreground">
          {entry.actorName ? <strong className="font-semibold text-foreground">{entry.actorName} </strong> : null}
          <span className="text-muted-foreground/70">{desc}</span>
        </p>
      </div>
      <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-muted-foreground/40">{timeAgo(entry.timestamp)}</span>
    </div>
  )
}

function SectionDivider({ label, cls }: { label: string; cls: string }) {
  return (
    <div className="px-5 pb-1 pt-3">
      <span className={cn('text-[10px] font-semibold uppercase tracking-[0.06em]', cls)}>{label}</span>
    </div>
  )
}

export function LiveActivity() {
  const entries = useAdminFeedStore((s) => s.entries)
  const initialized = useAdminFeedStore((s) => s.initialized)
  const [showAll, setShowAll] = useState(false)

  const meaningful = useMemo(() => {
    return entries
      .map((e) => ({ e, kind: classify(e.action) }))
      .filter((x): x is { e: AdminActivityEntry; kind: Kind } => x.kind != null)
  }, [entries])

  const pulse = computePulse(meaningful)
  const feed = showAll ? meaningful : meaningful.slice(0, 30)

  const grouped = useMemo(() => {
    const order: Kind[] = ['new', 'claim', 'conversion', 'money', 'handoff', 'stage']
    const groups: Record<Kind, typeof feed> = { new: [], claim: [], conversion: [], money: [], handoff: [], stage: [] }
    for (const item of feed) {
      groups[item.kind]?.push(item)
    }
    return order.filter((k) => groups[k].length > 0).map((k) => ({ kind: k, items: groups[k] }))
  }, [feed])

  return (
    <Card>
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
          <div className="flex items-center gap-2">
            <Zap className="size-4 text-primary" aria-hidden />
            <h2 className="text-[15px] font-semibold text-foreground tracking-[-0.01em]">Live Activity</h2>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-500">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
            </span>
            Live
          </span>
        </div>

        {/* Metrics */}
        <div className="flex gap-2 px-5 py-4">
          <Metric label="New" value={pulse.newLeads} cls="text-blue-400" />
          <Metric label="Claims" value={pulse.claims} cls="text-amber-400" />
          <Metric label="Conv." value={pulse.conversions} cls="text-emerald-400" />
          <Metric label="Revenue" value={pulse.money} cls="text-violet-400" />
        </div>

        {/* Feed header */}
        <div className="flex items-center justify-between border-t border-border/50 px-5 pb-1 pt-2">
          <span className="text-[11px] font-medium text-muted-foreground">Activity</span>
          <span className="text-[11px] font-medium text-muted-foreground/50">{pulse.total} events · Last hour</span>
        </div>

        {/* Feed */}
        <div className="max-h-80 overflow-y-auto">
          {feed.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground/50">
              {!initialized ? 'Connecting to live stream…' : 'No activity in the last hour.'}
            </p>
          ) : (
            grouped.map((g) => (
              <div key={g.kind}>
                <SectionDivider
                  label={g.kind === 'conversion' ? 'Conversions' : `${g.kind.charAt(0).toUpperCase() + g.kind.slice(1)}s`}
                  cls={COLORS[g.kind].chip}
                />
                {g.items.map(({ e, kind }) => (
                  <Row key={e.id} entry={e} kind={kind} />
                ))}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/50 px-5 py-2.5">
          <span className="text-[11px] font-medium text-muted-foreground/50">Updated in real-time</span>
          <div className="flex items-center gap-3">
            {feed.length > 0 && (
              <span className="text-[11px] font-medium text-muted-foreground/40">{feed.length} events</span>
            )}
            {meaningful.length > 30 && (
              <button
                type="button"
                onClick={() => setShowAll(!showAll)}
                className="text-[11px] font-semibold text-primary hover:underline"
              >
                {showAll ? 'Show Less' : 'View All →'}
              </button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
