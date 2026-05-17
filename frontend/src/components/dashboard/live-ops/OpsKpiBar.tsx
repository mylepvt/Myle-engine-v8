import { useState, useRef, useEffect } from 'react'
import { PhoneCall, TrendingUp, Users, ClipboardList, Send, CheckCircle2, XCircle, Smartphone } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api'
import {
  useTodayPulseQuery,
  type ReportStatusItem,
  type ZeroActivityItem,
  type ReminderResult,
  type SendRemindersResponse,
} from '@/hooks/use-today-pulse-query'

function KpiCard({
  label,
  value,
  sub,
  icon,
  urgent,
  onClick,
  clickable,
}: {
  label: string
  value: string | number
  sub: string
  icon: React.ReactNode
  urgent?: boolean
  onClick?: () => void
  clickable?: boolean
}) {
  const base = cn(
    'flex flex-col gap-2 rounded border px-4 py-3 transition-all duration-150',
    urgent ? 'border-amber-500/20 bg-amber-500/[0.06]' : 'border-white/[0.06] bg-white/[0.03]',
    clickable && 'cursor-pointer hover:border-white/20 hover:brightness-110 active:brightness-125',
  )
  const inner = (
    <>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
        <span className={urgent ? 'text-amber-400/70' : 'text-muted-foreground/40'}>{icon}</span>
        {label}
      </div>
      <span className={cn('text-[1.625rem] font-bold leading-none tabular-nums', urgent ? 'text-amber-300' : 'text-foreground')}>
        {value}
      </span>
      <p className="text-[10px] text-muted-foreground/40">{sub}</p>
    </>
  )
  if (onClick) {
    return <button className={base} onClick={onClick}>{inner}</button>
  }
  return <div className={base}>{inner}</div>
}

// ── Reports popover content — member list + WhatsApp send button ─────────────

function ReportsPopoverContent({
  members,
  onRefresh,
}: {
  members: ReportStatusItem[]
  onRefresh: () => void
}) {
  const [sending, setSending] = useState(false)
  const [sendLog, setSendLog] = useState<ReminderResult[] | null>(null)
  const [sendSummary, setSendSummary] = useState<Omit<SendRemindersResponse, 'results'> | null>(null)

  const submitted = members.filter((r) => r.submitted)
  const pending = members.filter((r) => !r.submitted)
  const unreminded = pending.filter((r) => !r.reminded)

  const sendReminders = async () => {
    setSending(true)
    setSendLog(null)
    try {
      const res = await apiFetch('/api/v1/admin/send-report-reminders', { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: SendRemindersResponse = await res.json()
      setSendLog(data.results)
      setSendSummary({ sent: data.sent, failed: data.failed, no_phone: data.no_phone })
      onRefresh()
    } catch {
      setSendLog([])
      setSendSummary({ sent: 0, failed: 0, no_phone: 0 })
    } finally {
      setSending(false)
    }
  }

  const statusIcon = (s: ReminderResult['status']) => {
    if (s === 'sent' || s === 'stub') return <CheckCircle2 className="size-3 text-emerald-400" />
    if (s === 'no_phone') return <Smartphone className="size-3 text-muted-foreground/40" />
    return <XCircle className="size-3 text-red-400" />
  }

  // After send: show results log
  if (sendLog !== null) {
    return (
      <div className="max-h-80 overflow-y-auto">
        {sendSummary && (
          <div className="sticky top-0 flex items-center gap-3 border-b border-border/40 bg-card px-3 py-2">
            <span className="text-[10px] font-semibold text-emerald-400">✅ {sendSummary.sent} sent</span>
            {sendSummary.failed > 0 && (
              <span className="text-[10px] font-semibold text-red-400">❌ {sendSummary.failed} failed</span>
            )}
            {sendSummary.no_phone > 0 && (
              <span className="text-[10px] font-semibold text-muted-foreground/50">📵 {sendSummary.no_phone} no phone</span>
            )}
          </div>
        )}
        {sendLog.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground/50">Koi pending member nahi tha.</p>
        ) : (
          <div className="px-3 pb-2">
            {sendLog.map((r) => (
              <div key={r.user_id} className="flex items-center gap-2 py-1.5">
                {statusIcon(r.status)}
                <span className="min-w-0 flex-1 truncate text-xs text-foreground">{r.name}</span>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/40">
                  {r.phone_tail !== '—' ? `···${r.phone_tail}` : 'no ph'}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="border-t border-border/40 px-3 py-2">
          <button
            onClick={() => { setSendLog(null); setSendSummary(null) }}
            className="text-[10px] text-muted-foreground/50 hover:text-foreground"
          >
            ← Back to list
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Member list */}
      <div className="max-h-64 overflow-y-auto divide-y divide-border/40">
        {submitted.length > 0 && (
          <div className="pb-1">
            <p className="sticky top-0 bg-card px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
              Submitted ({submitted.length})
            </p>
            <div className="px-3">
              {submitted.map((r) => (
                <div key={r.user_id} className="flex items-center gap-2 py-1.5">
                  <span className="size-1.5 shrink-0 rounded-full bg-emerald-400" />
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground">{r.name}</span>
                  <span className="shrink-0 text-[10px] capitalize text-muted-foreground/50">{r.role}</span>
                  {r.calls_in_report > 0 && (
                    <span className="shrink-0 text-[10px] text-emerald-400">{r.calls_in_report}c</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {pending.length > 0 && (
          <div className="pb-1">
            <p className="sticky top-0 bg-card px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
              Pending ({pending.length})
            </p>
            <div className="px-3">
              {pending.map((r) => (
                <div key={r.user_id} className="flex items-center gap-2 py-1.5">
                  <span className="size-1.5 shrink-0 rounded-full bg-amber-400" />
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground">{r.name}</span>
                  <span className="shrink-0 text-[10px] capitalize text-muted-foreground/50">{r.role}</span>
                  {r.reminded && (
                    <span className="shrink-0 rounded bg-emerald-500/10 px-1 py-px text-[9px] font-medium text-emerald-400">
                      WA ✓
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Send button — only when there are unreminded pending members */}
      {unreminded.length > 0 && (
        <div className="border-t border-border/40 px-3 py-2.5">
          <button
            disabled={sending}
            onClick={sendReminders}
            className="flex w-full items-center justify-center gap-1.5 rounded border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-1.5 text-[11px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/[0.14] disabled:opacity-50"
          >
            {sending ? (
              <>
                <span className="size-3 animate-spin rounded-full border border-emerald-400 border-t-transparent" />
                Sending…
              </>
            ) : (
              <>
                <Send className="size-3" />
                WhatsApp reminder bhejo ({unreminded.length})
              </>
            )}
          </button>
        </div>
      )}

      {/* All pending already reminded */}
      {pending.length > 0 && unreminded.length === 0 && (
        <div className="border-t border-border/40 px-3 py-2">
          <p className="text-[10px] text-emerald-400">WhatsApp reminder sabko bhej diya gaya ✓</p>
        </div>
      )}
    </div>
  )
}

// ── Generic popover wrapper ──────────────────────────────────────────────────

function PopoverCard({
  label,
  value,
  sub,
  icon,
  urgent,
  children,
}: {
  label: string
  value: string | number
  sub: string
  icon: React.ReactNode
  urgent?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <KpiCard label={label} value={value} sub={sub} icon={icon} urgent={urgent} clickable onClick={() => setOpen((v) => !v)} />
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-72 rounded border border-border/60 bg-card shadow-xl">
          {children}
        </div>
      )}
    </div>
  )
}

// ── Main bar ─────────────────────────────────────────────────────────────────

export function OpsKpiBar() {
  const pulse = useTodayPulseQuery()
  const qc = useQueryClient()
  const data = pulse.data

  const reportsSubmitted = data?.reports_submitted ?? 0
  const reportsTotal = data?.reports_total ?? 0
  const reportsPending = reportsTotal - reportsSubmitted
  const zeroActivity = data?.zero_activity ?? []

  const refreshPulse = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'today-pulse'] })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          label="Leads Added"
          value={data?.leads_today ?? '–'}
          sub="New leads added today"
          icon={<Users className="size-3" />}
        />
        <KpiCard
          label="Calls Today"
          value={data?.calls_today ?? '–'}
          sub="Total calls logged by team"
          icon={<PhoneCall className="size-3" />}
        />
        <KpiCard
          label="Min. FLP Billing"
          value={data?.flp_billing_count ?? '–'}
          sub="Leads at payment stage now"
          icon={<TrendingUp className="size-3" />}
        />
        <PopoverCard
          label="Reports"
          value={reportsTotal > 0 ? `${reportsSubmitted}/${reportsTotal}` : '–'}
          sub={reportsPending > 0 ? `${reportsPending} pending submission` : 'All submitted'}
          icon={<ClipboardList className="size-3" />}
          urgent={reportsPending > 0}
        >
          <ReportsPopoverContent
            members={data?.report_members ?? []}
            onRefresh={refreshPulse}
          />
        </PopoverCard>
      </div>

      {/* Zero-activity — only when members are online with no work */}
      {zeroActivity.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">
            No Activity
          </span>
          <ZeroActivityInline users={zeroActivity} />
        </div>
      )}
    </div>
  )
}

// ── Zero-activity inline chip ─────────────────────────────────────────────────

function ZeroActivityInline({ users }: { users: ZeroActivityItem[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded border border-amber-500/20 bg-amber-500/[0.05] px-3 py-1.5 text-[11px] font-semibold text-amber-300 transition-colors hover:bg-amber-500/[0.1]"
      >
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-amber-400" />
        </span>
        {users.length} online · no work today
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-64 rounded border border-border/60 bg-card shadow-xl">
          <div className="max-h-56 overflow-y-auto">
            <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
              Online · 0 activity today
            </p>
            <div className="px-3 pb-2">
              {users.map((z) => (
                <div key={z.user_id} className="flex items-center gap-2 py-1.5">
                  <span className="size-1.5 shrink-0 rounded-full bg-amber-400" />
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground">{z.name}</span>
                  <span className="shrink-0 text-[10px] capitalize text-muted-foreground/50">{z.role}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
