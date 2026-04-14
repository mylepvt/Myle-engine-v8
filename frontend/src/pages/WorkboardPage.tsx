import { type ReactElement, memo, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Video, Pencil, Search, CheckSquare } from 'lucide-react'
import { List, type RowComponentProps } from 'react-window'
import { LeadContactActions } from '@/components/leads/LeadContactActions'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  LEAD_STATUS_OPTIONS, type LeadPublic, type LeadStatus, usePatchLeadMutation,
} from '@/hooks/use-leads-query'
import { useWorkboardQuery } from '@/hooks/use-workboard-query'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────
type Props = { title: string }
type Col = { status: string; total: number; items: LeadPublic[] }

// ── Constants ──────────────────────────────────────────────────────────────────
const CALL_OPTS = [
  { value: 'not_called',     label: '📞 Not Called' },
  { value: 'no_answer',      label: '📵 No Answer' },
  { value: 'interested',     label: '✅ Interested' },
  { value: 'not_interested', label: '❌ Not Interested' },
  { value: 'follow_up',      label: '🔄 Follow Up' },
  { value: 'video_sent',     label: '📤 Video Sent' },
  { value: 'video_watched',  label: '👀 Video Watched' },
  { value: 'payment_done',   label: '💰 Payment Done' },
]
const BADGE: Record<string, string> = {
  new_lead:       'bg-primary/15 text-primary border-primary/25',
  contacted:      'bg-sky-400/15 text-sky-300 border-sky-400/25',
  invited:        'bg-violet-400/15 text-violet-300 border-violet-400/25',
  video_sent:     'bg-indigo-400/15 text-indigo-300 border-indigo-400/25',
  video_watched:  'bg-blue-400/15 text-blue-300 border-blue-400/25',
  paid:           'bg-amber-400/15 text-amber-300 border-amber-400/25',
  day1:           'bg-orange-400/15 text-orange-300 border-orange-400/25',
  day2:           'bg-yellow-400/15 text-yellow-300 border-yellow-400/25',
  interview:      'bg-lime-400/15 text-lime-300 border-lime-400/25',
  track_selected: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/25',
  seat_hold:      'bg-teal-400/15 text-teal-300 border-teal-400/25',
  converted:      'bg-green-500/15 text-green-300 border-green-500/25',
  lost:           'bg-destructive/15 text-destructive border-destructive/25',
}
const ENROLL: LeadStatus[] = ['new_lead','contacted','invited','video_sent','video_watched']
const ONHOLD: LeadStatus[] = ['paid','day1','day2','interview','track_selected','seat_hold']
const DAY3:   LeadStatus[] = ['interview','track_selected','seat_hold']
const CLOSE:  LeadStatus[] = ['converted','lost']
const slabel  = (s: string) => LEAD_STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s

function whatsappDigits(phone: string | null | undefined): string {
  return (phone ?? '').replace(/\D+/g, '')
}

function day2TestWhatsAppUrl(lead: LeadPublic): string | null {
  const digits = whatsappDigits(lead.phone)
  if (!digits) return null
  const testPath = '/dashboard/system/training'
  const testUrl = `${window.location.origin}${testPath}`
  const name = (lead.name || 'Participant').trim()
  const msg =
    `Hi ${name}, your Day 2 batches are complete.\n` +
    `Please take the test from this link:\n${testUrl}`
  return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`
}

// ── Tiny shared primitives ─────────────────────────────────────────────────────
type PM = ReturnType<typeof usePatchLeadMutation>

function Tabs({ tabs, active, onChange }: {
  tabs: { id: string; label: string; count?: number }[]
  active: string
  onChange: (id: string) => void
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-white/10">
      {tabs.map((t) => (
        <button key={t.id} type="button" onClick={() => onChange(t.id)}
          className={cn('shrink-0 -mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition',
            active === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          {t.label}
          {t.count !== undefined &&
            <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[0.65rem] tabular-nums">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

function IconBtn({ href, onClick, title, colorHover, children }: {
  href?: string; onClick?: () => void; title: string; colorHover: string; children: React.ReactNode
}) {
  const cls = cn('flex h-7 w-7 items-center justify-center rounded-md border border-white/12 bg-white/[0.05] text-foreground transition', colorHover)
  if (href) return <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" title={title} className={cls}>{children}</a>
  return <button type="button" title={title} onClick={onClick} className={cls}>{children}</button>
}

// ── LeadCard (team / leader / closing tab) ─────────────────────────────────────
const LeadCard = memo(function LeadCard({ lead, pm, leadPatchBusy }: { lead: LeadPublic; pm: PM; leadPatchBusy: boolean }) {
  const badge = BADGE[lead.status] ?? 'bg-muted/30 text-muted-foreground border-white/10'
  const isWatched = lead.status === 'video_watched' || lead.call_status === 'video_watched'
  const isSent    = !isWatched && (lead.status === 'video_sent' || lead.call_status === 'video_sent')
  return (
    <article className="surface-inset flex flex-col gap-2 rounded-lg px-2.5 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium leading-tight text-foreground">{lead.name}</p>
          {lead.city && <p className="mt-0.5 truncate text-[0.7rem] text-muted-foreground">{lead.city}</p>}
        </div>
        <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold', badge)}>{slabel(lead.status)}</span>
      </div>
      {isWatched && <div className="rounded-md bg-blue-400/10 px-2 py-1 text-[0.7rem] font-medium text-blue-300">👀 Prospect watched the video — call now!</div>}
      {isSent    && <div className="rounded-md bg-indigo-400/10 px-2 py-1 text-[0.7rem] font-medium text-indigo-300">📤 Video sent — waiting for response</div>}
      <select
        value={lead.call_status ?? 'not_called'}
        disabled={leadPatchBusy}
        aria-label={`Call status for ${lead.name}`}
        onChange={(e) => void pm.mutateAsync({ id: lead.id, body: { call_status: e.target.value } })}
        className="min-w-0 flex-1 rounded-md border border-white/12 bg-white/[0.05] px-2 py-1.5 text-xs text-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35"
      >
        {CALL_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <div className="flex items-center gap-1.5">
        <LeadContactActions phone={lead.phone} />
        <IconBtn title="Send Video" colorHover="hover:border-indigo-400/40 hover:text-indigo-400 disabled:opacity-50"
          onClick={() => void pm.mutateAsync({ id: lead.id, body: { call_status: 'video_sent', status: 'video_sent' as LeadStatus } })}>
          <Video className="h-3.5 w-3.5"/>
        </IconBtn>
        <Link to={`/dashboard/work/leads/${lead.id}`} title="Edit"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-white/12 bg-white/[0.05] transition hover:border-primary/40 hover:text-primary">
          <Pencil className="h-3.5 w-3.5"/>
        </Link>
      </div>
    </article>
  )
})

// ── AdminLeadCard (day tabs) ───────────────────────────────────────────────────
const AdminLeadCard = memo(function AdminLeadCard({ lead, dayKey, pm, leadPatchBusy, onMoveNext, nextLabel }: {
  lead: LeadPublic; dayKey: 1|2|3; pm: PM; leadPatchBusy: boolean; onMoveNext?: () => void; nextLabel?: string
}) {
  const batchSlots = dayKey === 1
    ? (['d1_morning', 'd1_afternoon', 'd1_evening'] as const)
    : dayKey === 2
    ? (['d2_morning', 'd2_afternoon', 'd2_evening'] as const)
    : null

  const done = batchSlots
    ? batchSlots.every((k) => lead[k])
    : !!lead.day3_completed_at

  const patchKey = dayKey === 3
    ? ('day3_completed' as const)
    : null
  const showDay2TestSend = dayKey === 2 && done

  const handleSendDay2Test = async () => {
    const waUrl = day2TestWhatsAppUrl(lead)
    if (!waUrl) return
    window.open(waUrl, '_blank', 'noopener,noreferrer')
    await pm.mutateAsync({ id: lead.id, body: { whatsapp_sent: true } })
  }

  return (
    <article className="surface-inset flex flex-col gap-2 rounded-lg px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium leading-tight text-foreground">{lead.name}</p>
          {lead.city && <p className="mt-0.5 text-[0.7rem] text-muted-foreground">{lead.city}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <LeadContactActions phone={lead.phone} />
          <Link to={`/dashboard/work/leads/${lead.id}`} title="Edit"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-white/12 bg-white/[0.05] transition hover:border-primary/40 hover:text-primary">
            <Pencil className="h-3.5 w-3.5"/>
          </Link>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[0.7rem] text-muted-foreground">Batches:</span>
        {batchSlots
          ? batchSlots.map((slotKey, i) => {
              const slot = (['M', 'A', 'E'] as const)[i]
              const slotDone = lead[slotKey]
              return (
                <button key={slotKey} type="button" disabled={leadPatchBusy || done}
                  onClick={() => void pm.mutateAsync({ id: lead.id, body: { [slotKey]: true } })}
                  className={cn('flex h-6 w-6 items-center justify-center rounded text-[0.65rem] font-semibold transition',
                    slotDone || done ? 'border border-emerald-400/30 bg-emerald-400/15 text-emerald-400'
                      : 'border border-white/12 bg-white/[0.05] text-muted-foreground hover:border-primary/40 hover:text-primary')}>
                  {slotDone || done ? <CheckSquare className="h-3 w-3"/> : <span>{slot}</span>}
                </button>
              )
            })
          : (['M','A','E'] as const).map((slot) => (
              <button key={slot} type="button" disabled={leadPatchBusy || done || !patchKey}
                onClick={() => void pm.mutateAsync({ id: lead.id, body: { [patchKey!]: true } })}
                className={cn('flex h-6 w-6 items-center justify-center rounded text-[0.65rem] font-semibold transition',
                  done ? 'border border-emerald-400/30 bg-emerald-400/15 text-emerald-400'
                    : 'border border-white/12 bg-white/[0.05] text-muted-foreground hover:border-primary/40 hover:text-primary')}>
                {done ? <CheckSquare className="h-3 w-3"/> : <span>{slot}</span>}
              </button>
            ))}
      </div>
      {showDay2TestSend && (
        <button
          type="button"
          disabled={leadPatchBusy}
          onClick={() => void handleSendDay2Test()}
          className="mt-0.5 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[0.7rem] font-semibold text-emerald-300 transition hover:bg-emerald-400/20 disabled:opacity-50"
        >
          Send Test on WhatsApp
        </button>
      )}
      {done && onMoveNext &&
        <button type="button" disabled={leadPatchBusy} onClick={onMoveNext}
          className="mt-0.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[0.7rem] font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-50">
          {nextLabel ?? 'Move to next stage →'}
        </button>}
    </article>
  )
})

const LEAD_CARD_ROW = 138
const ADMIN_CARD_ROW = 198

function leadsForColumn<T>(items: T[], colIndex: number, columnCount: number): T[] {
  const out: T[] = []
  for (let i = colIndex; i < items.length; i += columnCount) {
    out.push(items[i])
  }
  return out
}

function useBoardColumnCount(): number {
  const [n, setN] = useState(() => {
    if (typeof window === 'undefined') return 3
    const w = window.innerWidth
    if (w < 640) return 1
    if (w < 1024) return 2
    return 3
  })
  useEffect(() => {
    const q = () => {
      const w = window.innerWidth
      if (w < 640) setN(1)
      else if (w < 1024) setN(2)
      else setN(3)
    }
    window.addEventListener('resize', q)
    return () => window.removeEventListener('resize', q)
  }, [])
  return n
}

type LeadColData = { colLeads: LeadPublic[]; pm: PM; patchBusyLeadId: number | null }

function LeadColRow(props: RowComponentProps<LeadColData>): ReactElement | null {
  const { index, style, ariaAttributes, colLeads, pm, patchBusyLeadId } = props
  const lead = colLeads[index]
  if (!lead) return null
  return (
    <div {...ariaAttributes} style={style} className="box-border px-0.5 pb-2">
      <LeadCard lead={lead} pm={pm} leadPatchBusy={patchBusyLeadId === lead.id} />
    </div>
  )
}

const VirtualLeadColumn = memo(function VirtualLeadColumn({
  colLeads,
  height,
  pm,
  patchBusyLeadId,
}: {
  colLeads: LeadPublic[]
  height: number
  pm: PM
  patchBusyLeadId: number | null
}) {
  const itemData = useMemo(
    () => ({ colLeads, pm, patchBusyLeadId }),
    [colLeads, pm, patchBusyLeadId],
  )
  if (colLeads.length === 0) return <div className="min-h-0 min-w-0 flex-1" />
  return (
    <div className="min-h-0 min-w-0 flex-1">
      <List<LeadColData>
        rowCount={colLeads.length}
        rowHeight={LEAD_CARD_ROW}
        rowComponent={LeadColRow}
        rowProps={itemData}
        overscanCount={4}
        style={{ height, width: '100%' }}
      />
    </div>
  )
})

function VirtualLeadGrid({
  leads,
  pm,
  patchBusyLeadId,
  empty,
}: {
  leads: LeadPublic[]
  pm: PM
  patchBusyLeadId: number | null
  empty?: string
}) {
  const cols = useBoardColumnCount()
  const colArrays = useMemo(
    () => Array.from({ length: cols }, (_, c) => leadsForColumn(leads, c, cols)),
    [leads, cols],
  )
  const maxCol = Math.max(1, ...colArrays.map((c) => c.length))
  const listHeight = Math.min(520, Math.max(LEAD_CARD_ROW, maxCol * LEAD_CARD_ROW))

  if (leads.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-white/12 px-3 py-8 text-center text-xs text-muted-foreground">
        {empty ?? 'No leads'}
      </p>
    )
  }

  return (
    <div className="flex w-full gap-2" style={{ height: listHeight }}>
      {colArrays.map((colLeads, ci) => (
        <VirtualLeadColumn
          key={ci}
          colLeads={colLeads}
          height={listHeight}
          pm={pm}
          patchBusyLeadId={patchBusyLeadId}
        />
      ))}
    </div>
  )
}

type AdminColData = {
  colLeads: LeadPublic[]
  dayKey: 1 | 2 | 3
  nextStatus?: LeadStatus
  nextLabel?: string
  pm: PM
  patchBusyLeadId: number | null
}

function AdminColRow(props: RowComponentProps<AdminColData>): ReactElement | null {
  const { index, style, ariaAttributes, colLeads, dayKey, nextStatus, nextLabel, pm, patchBusyLeadId } = props
  const lead = colLeads[index]
  if (!lead) return null
  const onMoveNext = nextStatus
    ? () => void pm.mutateAsync({ id: lead.id, body: { status: nextStatus } })
    : undefined
  return (
    <div {...ariaAttributes} style={style} className="box-border px-0.5 pb-2">
      <AdminLeadCard
        lead={lead}
        dayKey={dayKey}
        pm={pm}
        leadPatchBusy={patchBusyLeadId === lead.id}
        onMoveNext={onMoveNext}
        nextLabel={nextLabel}
      />
    </div>
  )
}

const VirtualAdminColumn = memo(function VirtualAdminColumn({
  colLeads,
  height,
  dayKey,
  nextStatus,
  nextLabel,
  pm,
  patchBusyLeadId,
}: {
  colLeads: LeadPublic[]
  height: number
  dayKey: 1 | 2 | 3
  nextStatus?: LeadStatus
  nextLabel?: string
  pm: PM
  patchBusyLeadId: number | null
}) {
  const itemData = useMemo(
    () => ({ colLeads, dayKey, nextStatus, nextLabel, pm, patchBusyLeadId }),
    [colLeads, dayKey, nextStatus, nextLabel, pm, patchBusyLeadId],
  )
  if (colLeads.length === 0) return <div className="min-h-0 min-w-0 flex-1" />
  return (
    <div className="min-h-0 min-w-0 flex-1">
      <List<AdminColData>
        rowCount={colLeads.length}
        rowHeight={ADMIN_CARD_ROW}
        rowComponent={AdminColRow}
        rowProps={itemData}
        overscanCount={3}
        style={{ height, width: '100%' }}
      />
    </div>
  )
})

function VirtualAdminLeadGrid({
  leads,
  dayKey,
  nextStatus,
  nextLabel,
  pm,
  patchBusyLeadId,
}: {
  leads: LeadPublic[]
  dayKey: 1 | 2 | 3
  nextStatus?: LeadStatus
  nextLabel?: string
  pm: PM
  patchBusyLeadId: number | null
}) {
  const cols = useBoardColumnCount()
  const colArrays = useMemo(
    () => Array.from({ length: cols }, (_, c) => leadsForColumn(leads, c, cols)),
    [leads, cols],
  )
  const maxCol = Math.max(1, ...colArrays.map((c) => c.length))
  const listHeight = Math.min(520, Math.max(ADMIN_CARD_ROW, maxCol * ADMIN_CARD_ROW))

  if (leads.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-white/12 px-3 py-8 text-center text-xs text-muted-foreground">
        No leads
      </p>
    )
  }

  return (
    <div className="flex w-full gap-2" style={{ height: listHeight }}>
      {colArrays.map((colLeads, ci) => (
        <VirtualAdminColumn
          key={ci}
          colLeads={colLeads}
          height={listHeight}
          dayKey={dayKey}
          nextStatus={nextStatus}
          nextLabel={nextLabel}
          pm={pm}
          patchBusyLeadId={patchBusyLeadId}
        />
      ))}
    </div>
  )
}

// ── Grid section helper ────────────────────────────────────────────────────────
function Grid({ leads, pm, patchBusyLeadId, empty }: { leads: LeadPublic[]; pm: PM; patchBusyLeadId: number | null; empty?: string }) {
  return <VirtualLeadGrid leads={leads} pm={pm} patchBusyLeadId={patchBusyLeadId} empty={empty} />
}

// ── TeamView ───────────────────────────────────────────────────────────────────
function TeamView({ cols, pm, patchBusyLeadId, search }: { cols: Col[]; pm: PM; patchBusyLeadId: number | null; search: string }) {
  const [tab, setTab] = useState<'enrollment'|'onhold'>('enrollment')
  const callsRef = useRef<HTMLDivElement>(null)
  const videosRef = useRef<HTMLDivElement>(null)
  const byS = Object.fromEntries(cols.map((c) => [c.status, c]))
  const needle = search.trim().toLowerCase()
  const filterItems = (statuses: LeadStatus[]) =>
    statuses.flatMap((s) => (byS[s]?.items ?? []).filter((l) =>
      !needle || l.name.toLowerCase().includes(needle) || (l.phone ?? '').includes(needle)))

  const enrollLeads = filterItems(ENROLL)
  const onholdLeads = filterItems(ONHOLD)
  const pendingCalls = [...enrollLeads, ...onholdLeads].filter((l) => !l.call_status || l.call_status === 'not_called').length
  const videosToSend = enrollLeads.filter((l) => l.status === 'invited' && l.call_status === 'interested').length

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Total Leads',    value: enrollLeads.length + onholdLeads.length, sub: 'in pipeline',    color: 'text-foreground' },
          { label: 'Pending Calls',  value: pendingCalls,  sub: 'not yet called',  color: 'text-amber-300' },
          { label: 'Videos to Send', value: videosToSend,  sub: 'interested leads',color: 'text-indigo-300'},
          { label: 'Streak',         value: 0,             sub: 'days active',     color: 'text-primary'   },
        ].map((s) => (
          <div key={s.label} className="surface-elevated px-3 py-3">
            <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-muted-foreground">{s.label}</p>
            <p className={cn('mt-1 font-heading text-2xl tabular-nums', s.color)}>{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.sub}</p>
          </div>
        ))}
      </div>
      {/* Action cards */}
      {(pendingCalls > 0 || videosToSend > 0) && (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {pendingCalls > 0 &&
            <button type="button" onClick={() => callsRef.current?.scrollIntoView({ behavior:'smooth', block:'start' })}
              className="surface-elevated shrink-0 rounded-xl border border-amber-400/25 bg-amber-400/5 px-4 py-3 text-left transition hover:border-amber-400/50">
              <p className="text-lg font-bold text-amber-300">{pendingCalls}</p>
              <p className="text-xs text-muted-foreground">calls pending</p>
              <p className="mt-1 text-[0.7rem] text-amber-400/70">tap to scroll ↓</p>
            </button>}
          {videosToSend > 0 &&
            <button type="button" onClick={() => videosRef.current?.scrollIntoView({ behavior:'smooth', block:'start' })}
              className="surface-elevated shrink-0 rounded-xl border border-indigo-400/25 bg-indigo-400/5 px-4 py-3 text-left transition hover:border-indigo-400/50">
              <p className="text-lg font-bold text-indigo-300">{videosToSend}</p>
              <p className="text-xs text-muted-foreground">videos to send</p>
              <p className="mt-1 text-[0.7rem] text-indigo-400/70">tap to scroll ↓</p>
            </button>}
        </div>
      )}
      <Tabs tabs={[{id:'enrollment',label:'Enrollment',count:enrollLeads.length},{id:'onhold',label:'On Hold',count:onholdLeads.length}]}
        active={tab} onChange={(id) => setTab(id as typeof tab)}/>
      {tab === 'enrollment' ? (
        <div className="space-y-6" ref={callsRef}>
          {ENROLL.map((s) => {
            const items = (byS[s]?.items ?? []).filter((l) => !needle || l.name.toLowerCase().includes(needle) || (l.phone ?? '').includes(needle))
            const ref = s === 'video_sent' ? videosRef : undefined
            return (
              <div key={s} className="space-y-2" ref={ref as React.RefObject<HTMLDivElement>|undefined}>
                <h3 className="text-sm font-semibold text-muted-foreground">{slabel(s)}</h3>
                <Grid leads={items} pm={pm} patchBusyLeadId={patchBusyLeadId} />
              </div>
            )
          })}
        </div>
      ) : (
        <div className="space-y-6">
          {ONHOLD.map((s) => {
            const items = (byS[s]?.items ?? []).filter((l) => !needle || l.name.toLowerCase().includes(needle) || (l.phone ?? '').includes(needle))
            return (
              <div key={s} className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground">{slabel(s)}</h3>
                <Grid leads={items} pm={pm} patchBusyLeadId={patchBusyLeadId} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── DayGrid (hoisted outside AdminView to avoid component-in-render) ──────────
function DayGrid({ leads, dayKey, nextStatus, nextLabel, pm, patchBusyLeadId }: {
  leads: LeadPublic[]; dayKey: 1|2|3; nextStatus?: LeadStatus; nextLabel?: string; pm: PM; patchBusyLeadId: number | null
}) {
  return (
    <VirtualAdminLeadGrid
      leads={leads}
      dayKey={dayKey}
      nextStatus={nextStatus}
      nextLabel={nextLabel}
      pm={pm}
      patchBusyLeadId={patchBusyLeadId}
    />
  )
}

// ── AdminView ──────────────────────────────────────────────────────────────────
type ATab = 'day1'|'day2'|'day3'|'closing'
function AdminView({ cols, pm, patchBusyLeadId, search }: { cols: Col[]; pm: PM; patchBusyLeadId: number | null; search: string }) {
  const [tab, setTab] = useState<ATab>('day1')
  const byS = Object.fromEntries(cols.map((c) => [c.status, c]))
  const needle = search.trim().toLowerCase()
  const f = (statuses: string[]) =>
    statuses.flatMap((s) => (byS[s]?.items ?? []).filter((l) =>
      !needle || l.name.toLowerCase().includes(needle) || (l.phone ?? '').includes(needle)))

  const day1 = f(['day1']), day2 = f(['day2']), day3 = f(DAY3), closing = f(CLOSE)
  const tabs = [{id:'day1',label:'Day 1',count:day1.length},{id:'day2',label:'Day 2',count:day2.length},{id:'day3',label:'Day 3',count:day3.length},{id:'closing',label:'Closing',count:closing.length}]

  return (
    <div className="space-y-4">
      <Tabs tabs={tabs} active={tab} onChange={(id) => setTab(id as ATab)}/>
      {tab === 'day1' && <DayGrid leads={day1} dayKey={1} nextStatus="day2" nextLabel="Move to Day 2 →" pm={pm} patchBusyLeadId={patchBusyLeadId} />}
      {tab === 'day2' && (
        <div className="space-y-3">
          {/* Day 2 summary chips */}
          <div className="flex flex-wrap gap-2">
            {[['Complete', day2.filter((l) => !!l.day2_completed_at).length, 'bg-emerald-400/15 text-emerald-300 border-emerald-400/25'],
              ['In Progress', day2.filter((l) => !l.day2_completed_at && !!l.day1_completed_at).length, 'bg-amber-400/15 text-amber-300 border-amber-400/25'],
              ['Not Started', day2.filter((l) => !l.day1_completed_at).length, 'bg-muted/30 text-muted-foreground border-white/10'],
            ].map(([label, count, cls]) =>
              <span key={label as string} className={cn('rounded-full border px-2.5 py-0.5 text-xs font-medium', cls as string)}>{label}: {count}</span>)}
          </div>
          <DayGrid leads={day2} dayKey={2} nextStatus="interview" nextLabel="Move to Day 3 →" pm={pm} patchBusyLeadId={patchBusyLeadId} />
        </div>
      )}
      {tab === 'day3' && (
        <div className="space-y-6">
          {DAY3.map((s) => {
            const items = f([s])
            return (
              <div key={s} className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground">{slabel(s)}</h3>
                {items.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-white/12 px-3 py-6 text-center text-xs text-muted-foreground">
                    No leads
                  </p>
                ) : (
                  <VirtualAdminLeadGrid
                    leads={items}
                    dayKey={3}
                    pm={pm}
                    patchBusyLeadId={patchBusyLeadId}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
      {tab === 'closing' && (
        <div className="space-y-6">
          {CLOSE.map((s) => {
            const items = f([s])
            const badge = BADGE[s] ?? ''
            return (
              <div key={s} className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-muted-foreground">{slabel(s)}</h3>
                  <span className={cn('rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold', badge)}>{items.length}</span>
                </div>
                <Grid leads={items} pm={pm} patchBusyLeadId={patchBusyLeadId} empty="No leads" />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export function WorkboardPage({ title }: Props) {
  const { role } = useDashboardShellRole()
  const { data, isPending, isError, error, refetch } = useWorkboardQuery(true)
  const pm = usePatchLeadMutation()
  const patchBusyLeadId =
    pm.isPending && pm.variables && typeof pm.variables.id === 'number' ? pm.variables.id : null
  const [qInput, setQInput] = useState('')
  const [search, setSearch] = useState('')
  useEffect(() => {
    const id = window.setTimeout(() => setSearch(qInput), 350)
    return () => window.clearTimeout(id)
  }, [qInput])
  const cols: Col[] = useMemo(() => {
    const raw = data?.columns
    if (!raw?.length) return []
    return raw.map((c) => ({
      status: c.status,
      total: typeof c.total === 'number' ? c.total : 0,
      items: Array.isArray(c.items) ? c.items : [],
    }))
  }, [data])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {role === 'admin' ? 'Organization view — all active leads.' : role === 'leader' ? 'Your pipeline and team leads.' : 'Your personal pipeline.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" asChild>
            <Link to="/dashboard/work/add-lead">Add Lead</Link>
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="surface-elevated px-4 py-3">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden/>
          <input value={qInput} onChange={(e) => setQInput(e.target.value)}
            placeholder="Search by name or phone…"
            className="w-full rounded-md border border-white/12 bg-white/[0.05] py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35"/>
        </div>
      </div>

      {/* Loading skeleton */}
      {isPending && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({length:8}).map((_,i) => <Skeleton key={i} className="h-32 rounded-xl"/>)}
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="surface-elevated px-4 py-3 text-sm text-destructive" role="alert">
          {error instanceof Error ? error.message : 'Could not load workboard.'}{' '}
          <Button type="button" variant="ghost" size="sm" className="h-auto p-0" onClick={() => void refetch()}>Retry</Button>
        </div>
      )}

      {/* Mutation error */}
      {pm.isError && (
        <p className="text-xs text-destructive" role="alert">
          {pm.error instanceof Error ? pm.error.message : 'Could not update lead'}
        </p>
      )}

      {/* Main content */}
      {data && !isPending && (
        role === 'admin'
          ? <AdminView cols={cols} pm={pm} patchBusyLeadId={patchBusyLeadId} search={search} />
          : <TeamView cols={cols} pm={pm} patchBusyLeadId={patchBusyLeadId} search={search} />
      )}
    </div>
  )
}
