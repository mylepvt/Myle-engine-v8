import { useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, IndianRupee, Phone, Target, Users, Zap } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useLosQuery, type LosMemberRow } from '@/hooks/use-los-query'
import { cn } from '@/lib/utils'

type MemberFilter = 'all' | 'active' | 'inactive'

function pct(val: number, total: number) {
  if (!total) return 0
  return Math.min(100, Math.round((val / total) * 100))
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const p = pct(value, max)
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn('h-full rounded-full transition-all', color)}
        style={{ width: `${p}%` }}
      />
    </div>
  )
}

function ScoreTier({ score, tier }: { score: number; tier: string }) {
  const cfg = {
    strong: { label: 'Strong Leader', color: 'text-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    average: { label: 'Average', color: 'text-amber-500', bg: 'bg-amber-500/10 border-amber-500/20' },
    at_risk: { label: 'At Risk', color: 'text-red-500', bg: 'bg-red-500/10 border-red-500/20' },
  }[tier] ?? { label: tier, color: 'text-muted-foreground', bg: 'bg-muted border-border' }

  return (
    <div className={cn('flex items-center gap-3 rounded-xl border px-4 py-3', cfg.bg)}>
      <div className="flex-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Leader Score</p>
        <div className="mt-1 flex items-end gap-2">
          <span className={cn('text-4xl font-semibold tabular-nums', cfg.color)}>{score}</span>
          <span className="mb-1 text-sm text-muted-foreground">/ 100</span>
        </div>
        <p className={cn('mt-0.5 text-sm font-semibold', cfg.color)}>{cfg.label}</p>
      </div>
      <div className="relative size-16">
        <svg viewBox="0 0 36 36" className="-rotate-90 size-16">
          <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="3" className="stroke-muted" />
          <circle
            cx="18"
            cy="18"
            r="15.9"
            fill="none"
            strokeWidth="3"
            strokeDasharray={`${score} 100`}
            strokeLinecap="round"
            className={tier === 'strong' ? 'stroke-emerald-500' : tier === 'average' ? 'stroke-amber-500' : 'stroke-red-500'}
          />
        </svg>
        <span className={cn('absolute inset-0 flex items-center justify-center text-xs font-bold', cfg.color)}>
          {score}%
        </span>
      </div>
    </div>
  )
}

function MemberRow({ m }: { m: LosMemberRow }) {
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <span
            className={cn('size-2 shrink-0 rounded-full', m.is_active ? 'bg-emerald-500' : 'bg-red-500')}
            aria-hidden
          />
          <span className="text-sm font-medium">{m.name}</span>
        </div>
      </TableCell>
      <TableCell className="tabular-nums">
        <span className={cn('font-semibold', !m.call_gate_met && 'text-red-500')}>
          {m.calls_today}
        </span>
        <span className="text-muted-foreground">/{m.call_target}</span>
      </TableCell>
      <TableCell className="tabular-nums">{m.enrollments}</TableCell>
      <TableCell>
        <Badge
          variant={m.is_active ? 'default' : 'destructive'}
          className="text-[0.65rem]"
        >
          {m.is_active ? 'Active' : 'Inactive'}
        </Badge>
      </TableCell>
    </TableRow>
  )
}

export function LeaderOSPage() {
  const { data, isPending, isError } = useLosQuery(true)
  const [filter, setFilter] = useState<MemberFilter>('all')

  const members = data?.members ?? []
  const filtered = members.filter(
    (m) => filter === 'all' || (filter === 'active' ? m.is_active : !m.is_active),
  )

  if (isPending) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Failed to load Leader OS data.
      </div>
    )
  }

  const callsPct = pct(data.total_calls_today, data.calls_team_target)
  const actPct = pct(data.activations_today, data.activations_target)

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-4 pb-8">
      {/* Score */}
      <ScoreTier score={data.leader_score} tier={data.leader_tier} />

      {/* Today Snapshot */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="px-4 py-3.5">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-blue-400" aria-hidden />
              <span className="text-xs text-muted-foreground">Active Members</span>
            </div>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-blue-400">
              {data.active_count}
            </p>
            <p className="text-xs text-muted-foreground">
              {data.inactive_count} inactive
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="px-4 py-3.5">
            <div className="flex items-center gap-2">
              <Phone className="size-4 text-amber-400" aria-hidden />
              <span className="text-xs text-muted-foreground">Calls Today</span>
            </div>
            <p className={cn('mt-2 text-3xl font-semibold tabular-nums', callsPct < 60 ? 'text-red-400' : 'text-amber-400')}>
              {data.total_calls_today}
            </p>
            <p className="text-xs text-muted-foreground">Target {data.calls_team_target}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="px-4 py-3.5">
            <div className="flex items-center gap-2">
              <Zap className="size-4 text-violet-400" aria-hidden />
              <span className="text-xs text-muted-foreground">Activations</span>
            </div>
            <p className={cn('mt-2 text-3xl font-semibold tabular-nums', actPct < 60 ? 'text-red-400' : 'text-violet-400')}>
              {data.activations_today}
            </p>
            <p className="text-xs text-muted-foreground">Target {data.activations_target}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="px-4 py-3.5">
            <div className="flex items-center gap-2">
              <IndianRupee className="size-4 text-emerald-400" aria-hidden />
              <span className="text-xs text-muted-foreground">Today Billing</span>
            </div>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-emerald-400">
              ₹{data.billing_today_rupees.toLocaleString('en-IN')}
            </p>
            <p className="text-xs text-muted-foreground">
              {data.follow_ups_pending} follow-ups pending
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Target bars */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">Target Progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-4 pb-4">
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <Phone className="size-3 text-muted-foreground" aria-hidden />
                <span className="text-muted-foreground">Calls</span>
              </div>
              <span className={cn('font-semibold tabular-nums', callsPct < 60 ? 'text-red-500' : 'text-foreground')}>
                {data.total_calls_today} / {data.calls_team_target} ({callsPct}%)
              </span>
            </div>
            <ProgressBar value={data.total_calls_today} max={data.calls_team_target} color={callsPct >= 80 ? 'bg-emerald-500' : callsPct >= 60 ? 'bg-amber-500' : 'bg-red-500'} />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <Target className="size-3 text-muted-foreground" aria-hidden />
                <span className="text-muted-foreground">Activations</span>
              </div>
              <span className={cn('font-semibold tabular-nums', actPct < 60 ? 'text-red-500' : 'text-foreground')}>
                {data.activations_today} / {data.activations_target} ({actPct}%)
              </span>
            </div>
            <ProgressBar value={data.activations_today} max={data.activations_target} color={actPct >= 80 ? 'bg-emerald-500' : actPct >= 60 ? 'bg-violet-500' : 'bg-red-500'} />
          </div>
        </CardContent>
      </Card>

      {/* Member table */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Team Performance</CardTitle>
            <div className="flex gap-1">
              {(['all', 'active', 'inactive'] as MemberFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-xs font-medium transition',
                    filter === f
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {f === 'all' ? 'All' : f === 'active' ? '🟢 Active' : '🔴 Inactive'}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No members</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Calls</TableHead>
                  <TableHead>Activations</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((m) => (
                  <MemberRow key={m.user_id} m={m} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Alert: inactive members */}
      {data.inactive_count > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-500" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-red-500">
              {data.inactive_count} member{data.inactive_count > 1 ? 's' : ''} below call target
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Action required — send reminder or reassign leads.
            </p>
          </div>
        </div>
      )}

      {/* Basics streak warnings */}
      {data.basics_streak >= 14 && (
        <div className="flex items-start gap-3 rounded-xl border border-red-600/40 bg-red-600/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden />
          <div>
            <p className="text-sm font-bold text-red-600">Account locked — basics not met</p>
            <p className="mt-0.5 text-xs text-red-500/80">
              Team ne {data.basics_streak} din se daily call target miss kiya hai. Account lock ho gaya — admin se restore karwao.
            </p>
          </div>
        </div>
      )}

      {data.basics_streak >= 7 && data.basics_streak < 14 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
          <div>
            <p className="text-sm font-bold text-amber-500">Warning — team basics not met</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Team ne {data.basics_streak} din se daily call target miss kiya hai.{' '}
              <span className="font-semibold text-amber-500">
                {14 - data.basics_streak} din baad account lock ho sakta hai.
              </span>{' '}
              Abhi action lo.
            </p>
          </div>
        </div>
      )}

      {data.leader_tier === 'strong' && data.basics_streak === 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-500" aria-hidden />
          <p className="text-sm font-semibold text-emerald-500">Team performing strong — keep it up!</p>
        </div>
      )}
    </div>
  )
}
