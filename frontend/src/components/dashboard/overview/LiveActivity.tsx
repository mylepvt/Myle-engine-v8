import { useMemo } from 'react'
import {
  ArrowRight,
  ArrowRightLeft,
  Banknote,
  CheckCircle2,
  Sparkles,
  UserPlus,
  Zap,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { useAdminFeedStore, type AdminActivityEntry } from '@/stores/admin-feed-store'

type Kind = 'new' | 'claim' | 'conversion' | 'money' | 'handoff' | 'stage'

type KindMeta = { label: string; Icon: LucideIcon; cls: string; important?: boolean }

const KIND_META: Record<Kind, KindMeta> = {
  new: { label: 'New lead', Icon: Sparkles, cls: 'bg-blue-500/12 text-blue-600 dark:text-blue-400' },
  claim: { label: 'Claimed', Icon: UserPlus, cls: 'bg-amber-500/12 text-amber-600 dark:text-amber-400' },
  conversion: { label: 'Converted', Icon: CheckCircle2, cls: 'bg-emerald-500/14 text-emerald-600 dark:text-emerald-400', important: true },
  money: { label: 'Money', Icon: Banknote, cls: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400', important: true },
  handoff: { label: 'Handoff', Icon: ArrowRightLeft, cls: 'bg-violet-500/12 text-violet-600 dark:text-violet-400' },
  stage: { label: 'Stage', Icon: ArrowRight, cls: 'bg-muted text-muted-foreground' },
}

/** Map a raw action to a human category — or null to hide system noise. */
function classify(action: string): Kind | null {
  if (action === 'lead:created') return 'new'
  if (action === 'lead:claimed' || action === 'lead:batch_claimed') return 'claim'
  if (action === 'lead:closed') return 'conversion'
  if (action.startsWith('wallet')) return 'money'
  if (action === 'lead:assigned' || action === 'lead:auto_reassigned') return 'handoff'
  if (action === 'lead:transitioned' || action === 'lead_state') return 'stage'
  return null // shadow_*, scheduler.*, system:*, fsm:*, performance:*, duplicates → noise
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

function Row({ entry, kind }: { entry: AdminActivityEntry; kind: Kind }) {
  const meta = KIND_META[kind]
  const Icon = meta.Icon
  return (
    <div className="flex items-start gap-3 py-2">
      <span className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg', meta.cls)}>
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">
          {entry.actorName ? <span className="font-medium">{entry.actorName}</span> : null}{' '}
          <span className="text-muted-foreground">{entry.description}</span>
        </p>
      </div>
      <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-muted-foreground/60">{timeAgo(entry.timestamp)}</span>
    </div>
  )
}

function PulseChip({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className={cn('flex-1 rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5 text-center', value === 0 && 'opacity-60')}>
      <p className={cn('text-base font-bold tabular-nums leading-none', cls)}>{value}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{label}</p>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Live Activity — smart last-hour pulse + noise-filtered clean feed
 * ────────────────────────────────────────────────────────────────────────── */
export function LiveActivity() {
  const entries = useAdminFeedStore((s) => s.entries)
  const initialized = useAdminFeedStore((s) => s.initialized)

  // Keep only meaningful, human/business events — drop scheduler/shadow/system noise.
  const meaningful = useMemo(() => {
    return entries
      .map((e) => ({ e, kind: classify(e.action) }))
      .filter((x): x is { e: AdminActivityEntry; kind: Kind } => x.kind != null)
  }, [entries])

  // Last-hour pulse — the "intelligent" summary, not just a list.
  const pulse = computePulse(meaningful)

  const feed = meaningful.slice(0, 30)

  return (
    <Card className="border-border/60">
      <CardContent className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="size-4 text-primary" aria-hidden />
            <h2 className="font-heading text-ds-h3 font-semibold text-foreground">Live Activity</h2>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-success">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-success" />
            </span>
            live
          </span>
        </div>

        {/* Pulse — last hour at a glance */}
        <div className="mb-3 flex items-stretch gap-2">
          <PulseChip label="New" value={pulse.newLeads} cls="text-blue-600 dark:text-blue-400" />
          <PulseChip label="Claims" value={pulse.claims} cls="text-amber-600 dark:text-amber-400" />
          <PulseChip label="Converted" value={pulse.conversions} cls="text-emerald-600 dark:text-emerald-400" />
          <PulseChip label="Money" value={pulse.money} cls="text-emerald-600 dark:text-emerald-400" />
        </div>
        <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground/60">Last hour · {pulse.total} events</p>

        {/* Feed */}
        <div className="max-h-80 divide-y divide-border/30 overflow-y-auto">
          {feed.length === 0 ? (
            <p className="py-10 text-center text-ds-caption text-muted-foreground">
              {!initialized ? 'Connecting to live stream…' : 'Quiet right now — no recent activity.'}
            </p>
          ) : (
            feed.map(({ e, kind }) => <Row key={e.id} entry={e} kind={kind} />)
          )}
        </div>
      </CardContent>
    </Card>
  )
}
