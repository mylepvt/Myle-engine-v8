import { useMemo } from 'react'
import {
  ArrowRight,
  ArrowRightLeft,
  Banknote,
  CheckCircle2,
  Sparkles,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { useAdminFeedStore, type AdminActivityEntry } from '@/stores/admin-feed-store'

type Kind = 'new' | 'claim' | 'conversion' | 'money' | 'handoff' | 'stage'

const ICONS: Record<Kind, LucideIcon> = {
  new: Sparkles,
  claim: UserPlus,
  conversion: CheckCircle2,
  money: Banknote,
  handoff: ArrowRightLeft,
  stage: ArrowRight,
}

const COLORS: Record<Kind, { bg: string; text: string; chip: string }> = {
  new:        { bg: '#1e3a5f', text: '#93c5fd', chip: '#60a5fa' },
  claim:      { bg: '#3b2f0e', text: '#fde68a', chip: '#fbbf24' },
  conversion: { bg: '#0d3320', text: '#6ee7b7', chip: '#34d399' },
  money:      { bg: '#1f1438', text: '#c4b5fd', chip: '#a78bfa' },
  handoff:    { bg: '#1e1b2e', text: '#a5b4fc', chip: '#a5b4fc' },
  stage:      { bg: '#3a3a3c', text: '#a1a1a6', chip: '#8e8e93' },
}

function classify(action: string): Kind | null {
  if (action === 'lead:created') return 'new'
  if (action === 'lead:claimed' || action === 'lead:batch_claimed') return 'claim'
  if (action === 'lead:closed') return 'conversion'
  if (action.startsWith('wallet')) return 'money'
  if (action === 'lead:assigned' || action === 'lead:auto_reassigned') return 'handoff'
  if (action === 'lead:transitioned' || action === 'lead_state') return 'stage'
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

function Metric({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex-1 rounded-xl bg-[#3a3a3c] px-3 py-3 text-center">
      <p className="text-xl font-bold tabular-nums" style={{ color }}>{value}</p>
      <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.03em] text-[#8e8e93]">{label}</p>
    </div>
  )
}

function Row({ entry, kind }: { entry: AdminActivityEntry; kind: Kind }) {
  const c = COLORS[kind]
  const Icon = ICONS[kind]
  const desc = cleanDesc(kind, entry.description)

  return (
    <div className="flex items-start gap-3 border-b border-[#3a3a3c] px-5 py-3 transition-colors hover:bg-[#333335]">
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-lg"
        style={{ background: c.bg, color: c.text }}
      >
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm leading-snug text-[#f5f5f7]">
          {entry.actorName ? <strong className="font-semibold text-white">{entry.actorName} </strong> : null}
          <span className="text-[#a1a1a6]">{desc}</span>
        </p>
      </div>
      <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-[#48484a]">{timeAgo(entry.timestamp)}</span>
    </div>
  )
}

function SectionDivider({ label, color }: { label: string; color: string }) {
  return (
    <div className="px-5 pb-1 pt-3">
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color }}>{label}</span>
    </div>
  )
}

export function LiveActivity() {
  const entries = useAdminFeedStore((s) => s.entries)
  const initialized = useAdminFeedStore((s) => s.initialized)

  const meaningful = useMemo(() => {
    return entries
      .map((e) => ({ e, kind: classify(e.action) }))
      .filter((x): x is { e: AdminActivityEntry; kind: Kind } => x.kind != null)
  }, [entries])

  const pulse = computePulse(meaningful)
  const feed = meaningful.slice(0, 30)

  const grouped = useMemo(() => {
    const order: Kind[] = ['new', 'claim', 'conversion', 'money', 'handoff', 'stage']
    const groups: Record<Kind, typeof feed> = { new: [], claim: [], conversion: [], money: [], handoff: [], stage: [] }
    for (const item of feed) {
      groups[item.kind]?.push(item)
    }
    return order.filter((k) => groups[k].length > 0).map((k) => ({ kind: k, items: groups[k] }))
  }, [feed])

  return (
    <Card className="border-none bg-[#2c2c2e] shadow-[0_4px_12px_rgba(0,0,0,0.3)]">
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#3a3a3c] px-5 py-4">
          <h2 className="text-[15px] font-semibold text-[#f5f5f7] tracking-[-0.01em]">Live Activity</h2>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#34d399]">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#34d399] opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-[#34d399]" />
            </span>
            Live
          </span>
        </div>

        {/* Metrics */}
        <div className="flex gap-2 px-5 py-4">
          <Metric label="New" value={pulse.newLeads} color="#60a5fa" />
          <Metric label="Claims" value={pulse.claims} color="#fbbf24" />
          <Metric label="Conv." value={pulse.conversions} color="#34d399" />
          <Metric label="Revenue" value={pulse.money} color="#a78bfa" />
        </div>

        {/* Feed header */}
        <div className="flex items-center justify-between border-t border-[#3a3a3c] px-5 pb-1 pt-2">
          <span className="text-[11px] font-medium text-[#8e8e93]">Activity</span>
          <span className="text-[11px] font-medium text-[#636366]">{pulse.total} events · Last hour</span>
        </div>

        {/* Feed */}
        <div className="max-h-80 overflow-y-auto">
          {feed.length === 0 ? (
            <p className="py-12 text-center text-sm text-[#636366]">
              {!initialized ? 'Connecting to live stream…' : 'No activity in the last hour.'}
            </p>
          ) : (
            grouped.map((g) => (
              <div key={g.kind}>
                <SectionDivider label={g.kind === 'conversion' ? 'Conversions' : `${g.kind.charAt(0).toUpperCase() + g.kind.slice(1)}s`} color={COLORS[g.kind].chip} />
                {g.items.map(({ e, kind }) => (
                  <Row key={e.id} entry={e} kind={kind} />
                ))}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#3a3a3c] px-5 py-2.5">
          <span className="text-[11px] font-medium text-[#636366]">Updated in real-time</span>
          {feed.length > 0 && (
            <span className="text-[11px] font-medium text-[#48484a]">{feed.length} events</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
