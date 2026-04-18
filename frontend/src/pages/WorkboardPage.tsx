import { type ReactElement, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, CheckSquare, Eye, Pencil, Search, Send, Upload, Video } from 'lucide-react'
import { List, type RowComponentProps } from 'react-window'
import { useQueryClient } from '@tanstack/react-query'
import { LeadContactActions } from '@/components/leads/LeadContactActions'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  fetchMindsetLockPreview,
  LEAD_STATUS_OPTIONS,
  postMindsetLockComplete,
  type LeadPublic,
  type LeadStatus,
  type MindsetLockPreviewResponse,
  usePatchLeadMutation,
} from '@/hooks/use-leads-query'
import { useWorkboardQuery } from '@/hooks/use-workboard-query'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import { apiFetch } from '@/lib/api'
import { whatsappDigits } from '@/lib/phone-links'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────
type Props = { title: string }
type Col = { status: string; total: number; items: LeadPublic[] }

// ── Constants ──────────────────────────────────────────────────────────────────
const CALL_OPTS = [
  { value: 'not_called', label: 'Not Called' },
  { value: 'no_answer', label: 'No Answer' },
  { value: 'interested', label: 'Interested' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'video_sent', label: 'Video Sent' },
  { value: 'video_watched', label: 'Video Watched' },
  { value: 'payment_done', label: 'Payment Done' },
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
const DAY3:   LeadStatus[] = ['interview','track_selected','seat_hold']
const CLOSE:  LeadStatus[] = ['converted','lost']
const MIN_MINDSET_SECONDS = 300
type BatchSlotKey = 'd1_morning' | 'd1_afternoon' | 'd1_evening' | 'd2_morning' | 'd2_afternoon' | 'd2_evening'
const slabel  = (s: string) => LEAD_STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s

function mmss(totalSeconds: number): string {
  const sec = Math.max(0, totalSeconds)
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function day2TestWhatsAppUrl(lead: LeadPublic): string | null {
  const digits = whatsappDigits(lead.phone ?? '')
  if (!digits) return null
  const testPath = '/dashboard/system/training'
  const testUrl = `${window.location.origin}${testPath}`
  const name = (lead.name || 'Participant').trim()
  const msg =
    `Hi ${name}, your Day 2 batches are complete.\n` +
    `Please take the test from this link:\n${testUrl}`
  return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`
}

function workboardBatchWhatsAppUrl(
  lead: LeadPublic,
  dayKey: 1 | 2 | 3,
  slot: 'M' | 'A' | 'E',
  links?: { v1?: string; v2?: string },
): string | null {
  const digits = whatsappDigits(lead.phone ?? '')
  if (!digits) return null
  const name = (lead.name || 'Participant').trim()
  const linkBlock =
    (links?.v1 ? `📹 Video 1:\n${links.v1}\n` : '') +
    (links?.v2 ? `📹 Video 2:\n${links.v2}\n` : '')
  const msg =
    `Hi ${name},\n` +
    `Your Day ${dayKey} ${slot} batch is starting now.\n` +
    (linkBlock ? `\n${linkBlock}` : '\n') +
    'Please watch and confirm.'
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
            <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-ds-caption tabular-nums">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

function IconBtn({ href, onClick, title, colorHover, children }: {
  href?: string; onClick?: () => void; title: string; colorHover: string; children: React.ReactNode
}) {
  const cls = cn('flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted/30 text-foreground transition', colorHover)
  if (href) return <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" title={title} className={cls}>{children}</a>
  return <button type="button" title={title} onClick={onClick} className={cls}>{children}</button>
}

// ── LeadCard (team / leader / closing tab) ─────────────────────────────────────
const LeadCard = memo(function LeadCard({
  lead,
  pm,
  leadPatchBusy,
  mindsetBusy,
  mindsetPreview,
  onRequestMindsetSend,
}: {
  lead: LeadPublic
  pm: PM
  leadPatchBusy: boolean
  mindsetBusy?: boolean
  mindsetPreview?: MindsetLockPreviewResponse | null
  onRequestMindsetSend?: (lead: LeadPublic) => void
}) {
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  // ── Proof upload ──────────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadDone, setUploadDone] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const qc = useQueryClient()

  const proofAlreadyUploaded =
    lead.payment_status === 'proof_uploaded' ||
    lead.payment_status === 'approved'

  async function handleProofFile(file: File) {
    setUploading(true)
    setUploadError(null)
    try {
      const fd = new FormData()
      fd.append('proof_file', file)
      fd.append('lead_id', String(lead.id))
      fd.append('payment_amount_cents', '19600')
      await apiFetch('/api/v1/payments/proof/upload', { method: 'POST', body: fd })
      setUploadDone(true)
      void qc.invalidateQueries({ queryKey: ['workboard'] })
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const badge = BADGE[lead.status] ?? 'bg-muted/30 text-muted-foreground border-white/10'
  const isWatched = lead.status === 'video_watched' || lead.call_status === 'video_watched'
  const isSent    = !isWatched && (lead.status === 'video_sent' || lead.call_status === 'video_sent')
  const mindsetReady =
    lead.status === 'paid' &&
    !!(lead.payment_proof_url ?? '').trim() &&
    lead.payment_status === 'approved' &&
    lead.mindset_lock_state !== 'leader_assigned'
  const startedAtMs = lead.mindset_started_at ? new Date(lead.mindset_started_at).getTime() : null
  const elapsedSeconds = startedAtMs ? Math.max(0, Math.floor((nowMs - startedAtMs) / 1000)) : 0
  const remainingSeconds = Math.max(0, MIN_MINDSET_SECONDS - elapsedSeconds)
  const unlocked = remainingSeconds === 0
  const lockLineClass = unlocked ? 'text-emerald-300' : 'text-red-300'
  const previewName = mindsetPreview?.leader_name ?? 'Resolving...'
  const canSend = mindsetReady && unlocked && !!mindsetPreview?.leader_user_id
  return (
    <article className="surface-inset flex flex-col gap-2 rounded-lg px-2.5 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium leading-tight text-foreground">{lead.name}</p>
          {lead.city && <p className="mt-0.5 truncate text-ds-caption text-muted-foreground">{lead.city}</p>}
        </div>
        <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-ds-caption font-semibold', badge)}>{slabel(lead.status)}</span>
      </div>
      {isWatched ? (
        <div className="flex items-center gap-1.5 rounded-md bg-blue-400/10 px-2 py-1 text-ds-caption font-medium text-blue-300">
          <Eye className="size-3.5 shrink-0" aria-hidden />
          <span>Prospect watched the video — call now!</span>
        </div>
      ) : null}
      {isSent ? (
        <div className="flex items-center gap-1.5 rounded-md bg-indigo-400/10 px-2 py-1 text-ds-caption font-medium text-indigo-300">
          <Send className="size-3.5 shrink-0" aria-hidden />
          <span>Video sent — waiting for response</span>
        </div>
      ) : null}
      <select
        value={lead.call_status ?? 'not_called'}
        disabled={leadPatchBusy}
        aria-label={`Call status for ${lead.name}`}
        onChange={(e) => void pm.mutateAsync({ id: lead.id, body: { call_status: e.target.value } })}
        className="min-w-0 flex-1 rounded-md border border-border bg-muted/30 px-2 py-1.5 text-ds-caption text-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35"
      >
        {CALL_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <div className="flex items-center gap-1.5">
        <LeadContactActions phone={lead.phone} />
        <IconBtn title="Send Video" colorHover="hover:border-indigo-400/40 hover:text-indigo-400 disabled:opacity-50"
          onClick={() => void pm.mutateAsync({ id: lead.id, body: { call_status: 'video_sent', status: 'video_sent' as LeadStatus } })}>
          <Video className="h-3.5 w-3.5"/>
        </IconBtn>
        {/* ₹196 proof upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleProofFile(file)
            e.target.value = ''
          }}
        />
        {proofAlreadyUploaded || uploadDone ? (
          <span title="Proof uploaded" className="flex h-8 w-8 items-center justify-center rounded-md border border-emerald-400/30 bg-emerald-400/12 text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
          </span>
        ) : (
          <button
            type="button"
            title={uploading ? 'Uploading…' : uploadError ? `Retry — ${uploadError}` : 'Upload ₹196 proof'}
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-md border bg-muted/30 transition disabled:opacity-50',
              uploadError
                ? 'border-red-400/40 text-red-400 hover:bg-red-400/10'
                : 'border-border text-foreground hover:border-amber-400/40 hover:text-amber-400',
            )}
          >
            <Upload className="h-3.5 w-3.5" />
          </button>
        )}
        <Link to={`/dashboard/work/leads/${lead.id}`} title="Edit"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted/30 transition hover:border-primary/40 hover:text-primary">
          <Pencil className="h-3.5 w-3.5"/>
        </Link>
      </div>
      {mindsetReady ? (
        <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 px-2 py-2">
          <p className={cn('text-ds-caption font-semibold', lockLineClass)}>
            Minimum call time: {mmss(remainingSeconds)}
          </p>
          <p className="text-ds-caption text-muted-foreground">
            Will be assigned to: <span className="font-semibold text-foreground">{previewName}</span>
          </p>
          <button
            type="button"
            title={!canSend ? 'Complete at least 5 minutes call before sending' : 'Send to leader'}
            disabled={!canSend || mindsetBusy}
            onClick={() => onRequestMindsetSend?.(lead)}
            className={cn(
              'flex h-8 w-full items-center justify-center gap-1 rounded-md border px-2 text-ds-caption font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
              canSend
                ? 'border-emerald-400/40 bg-emerald-400/12 text-emerald-300 hover:bg-emerald-400/20'
                : 'border-red-400/30 bg-red-400/10 text-red-300',
            )}
          >
            <CheckSquare className="h-3.5 w-3.5" />
            <span>{mindsetBusy ? 'Sending...' : 'Lock & Send to Leader'}</span>
          </button>
        </div>
      ) : null}
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

  const handleBatchClick = async (slot: 'M' | 'A' | 'E', slotKey?: BatchSlotKey) => {
    let tokenizedLinks: { v1?: string; v2?: string } | undefined
    if (slotKey) {
      const res = await apiFetch(`/api/v1/leads/${lead.id}/batch-share-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot: slotKey }),
      })
      if (res.ok) {
        const body = (await res.json()) as { watch_url_v1?: string; watch_url_v2?: string }
        tokenizedLinks = { v1: body.watch_url_v1, v2: body.watch_url_v2 }
      }
    }
    const waUrl = workboardBatchWhatsAppUrl(lead, dayKey, slot, tokenizedLinks)
    if (waUrl) {
      window.open(waUrl, '_blank', 'noopener,noreferrer')
    }
    if (slotKey) {
      // Batch slot auto-turns green from watch token completion callback.
      return
    }
    if (patchKey) {
      await pm.mutateAsync({ id: lead.id, body: { [patchKey]: true } })
    }
  }

  return (
    <article className="surface-inset flex flex-col gap-2 rounded-lg px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium leading-tight text-foreground">{lead.name}</p>
          {lead.city && <p className="mt-0.5 text-ds-caption text-muted-foreground">{lead.city}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <LeadContactActions phone={lead.phone} />
          <Link to={`/dashboard/work/leads/${lead.id}`} title="Edit"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted/30 transition hover:border-primary/40 hover:text-primary">
            <Pencil className="h-3.5 w-3.5"/>
          </Link>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-ds-caption text-muted-foreground">Batches:</span>
        {batchSlots
          ? batchSlots.map((slotKey, i) => {
              const slot = (['M', 'A', 'E'] as const)[i]
              const slotDone = lead[slotKey]
              return (
                <button key={slotKey} type="button" disabled={leadPatchBusy || done}
                  onClick={() => void handleBatchClick(slot, slotKey)}
                  className={cn('flex h-6 w-6 items-center justify-center rounded text-ds-caption font-semibold transition',
                    slotDone || done ? 'border border-emerald-400/30 bg-emerald-400/15 text-emerald-400'
                      : 'border border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:text-primary')}>
                  {slotDone || done ? <CheckSquare className="h-3 w-3"/> : <span>{slot}</span>}
                </button>
              )
            })
          : (['M','A','E'] as const).map((slot) => (
              <button key={slot} type="button" disabled={leadPatchBusy || done || !patchKey}
                onClick={() => void handleBatchClick(slot)}
                className={cn('flex h-6 w-6 items-center justify-center rounded text-ds-caption font-semibold transition',
                  done ? 'border border-emerald-400/30 bg-emerald-400/15 text-emerald-400'
                    : 'border border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:text-primary')}>
                {done ? <CheckSquare className="h-3 w-3"/> : <span>{slot}</span>}
              </button>
            ))}
      </div>
      {showDay2TestSend && (
        <button
          type="button"
          disabled={leadPatchBusy}
          onClick={() => void handleSendDay2Test()}
          className="mt-0.5 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-ds-caption font-semibold text-emerald-300 transition hover:bg-emerald-400/20 disabled:opacity-50"
        >
          Send Test on WhatsApp
        </button>
      )}
      {done && onMoveNext &&
        <button type="button" disabled={leadPatchBusy} onClick={onMoveNext}
          className="mt-0.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-ds-caption font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-50">
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

type LeadColData = {
  colLeads: LeadPublic[]
  pm: PM
  patchBusyLeadId: number | null
  mindsetBusyLeadId: number | null
  mindsetPreviewByLeadId: Record<number, MindsetLockPreviewResponse | undefined>
  onRequestMindsetSend?: (lead: LeadPublic) => void
}

function LeadColRow(props: RowComponentProps<LeadColData>): ReactElement | null {
  const {
    index,
    style,
    ariaAttributes,
    colLeads,
    pm,
    patchBusyLeadId,
    mindsetBusyLeadId,
    mindsetPreviewByLeadId,
    onRequestMindsetSend,
  } = props
  const lead = colLeads[index]
  if (!lead) return null
  return (
    <div {...ariaAttributes} style={style} className="box-border px-0.5 pb-2">
      <LeadCard
        lead={lead}
        pm={pm}
        leadPatchBusy={patchBusyLeadId === lead.id}
        mindsetBusy={mindsetBusyLeadId === lead.id}
        mindsetPreview={mindsetPreviewByLeadId[lead.id] ?? null}
        onRequestMindsetSend={onRequestMindsetSend}
      />
    </div>
  )
}

const VirtualLeadColumn = memo(function VirtualLeadColumn({
  colLeads,
  height,
  pm,
  patchBusyLeadId,
  mindsetBusyLeadId,
  mindsetPreviewByLeadId,
  onRequestMindsetSend,
}: {
  colLeads: LeadPublic[]
  height: number
  pm: PM
  patchBusyLeadId: number | null
  mindsetBusyLeadId: number | null
  mindsetPreviewByLeadId: Record<number, MindsetLockPreviewResponse | undefined>
  onRequestMindsetSend?: (lead: LeadPublic) => void
}) {
  const itemData = useMemo(
    () => ({
      colLeads,
      pm,
      patchBusyLeadId,
      mindsetBusyLeadId,
      mindsetPreviewByLeadId,
      onRequestMindsetSend,
    }),
    [colLeads, pm, patchBusyLeadId, mindsetBusyLeadId, mindsetPreviewByLeadId, onRequestMindsetSend],
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
  mindsetBusyLeadId,
  mindsetPreviewByLeadId,
  onRequestMindsetSend,
  empty,
}: {
  leads: LeadPublic[]
  pm: PM
  patchBusyLeadId: number | null
  mindsetBusyLeadId: number | null
  mindsetPreviewByLeadId: Record<number, MindsetLockPreviewResponse | undefined>
  onRequestMindsetSend?: (lead: LeadPublic) => void
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
      <p className="rounded-lg border border-dashed border-border/70 px-3 py-8 text-center text-ds-caption text-muted-foreground">
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
          mindsetBusyLeadId={mindsetBusyLeadId}
          mindsetPreviewByLeadId={mindsetPreviewByLeadId}
          onRequestMindsetSend={onRequestMindsetSend}
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
      <p className="rounded-lg border border-dashed border-border/70 px-3 py-8 text-center text-ds-caption text-muted-foreground">
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
function Grid({
  leads,
  pm,
  patchBusyLeadId,
  mindsetBusyLeadId = null,
  mindsetPreviewByLeadId = {},
  onRequestMindsetSend,
  empty,
}: {
  leads: LeadPublic[]
  pm: PM
  patchBusyLeadId: number | null
  mindsetBusyLeadId?: number | null
  mindsetPreviewByLeadId?: Record<number, MindsetLockPreviewResponse | undefined>
  onRequestMindsetSend?: (lead: LeadPublic) => void
  empty?: string
}) {
  return (
    <VirtualLeadGrid
      leads={leads}
      pm={pm}
      patchBusyLeadId={patchBusyLeadId}
      mindsetBusyLeadId={mindsetBusyLeadId}
      mindsetPreviewByLeadId={mindsetPreviewByLeadId}
      onRequestMindsetSend={onRequestMindsetSend}
      empty={empty}
    />
  )
}

// ── TeamView ───────────────────────────────────────────────────────────────────
function TeamView({
  cols,
  pm,
  patchBusyLeadId,
  mindsetBusyLeadId,
  mindsetPreviewByLeadId,
  ensureMindsetPreview,
  onRequestMindsetSend,
  search,
}: {
  cols: Col[]
  pm: PM
  patchBusyLeadId: number | null
  mindsetBusyLeadId: number | null
  mindsetPreviewByLeadId: Record<number, MindsetLockPreviewResponse | undefined>
  ensureMindsetPreview: (lead: LeadPublic) => void
  onRequestMindsetSend?: (lead: LeadPublic) => void
  search: string
}) {
  const byS = Object.fromEntries(cols.map((c) => [c.status, c]))
  const needle = search.trim().toLowerCase()
  const mindsetLeads = (byS.paid?.items ?? []).filter(
    (l) =>
      l.mindset_lock_state === 'mindset_lock' &&
      (!needle || l.name.toLowerCase().includes(needle) || (l.phone ?? '').includes(needle)),
  )
  useEffect(() => {
    mindsetLeads.forEach((lead) => {
      const ready =
        lead.status === 'paid' &&
        !!(lead.payment_proof_url ?? '').trim() &&
        lead.payment_status === 'approved' &&
        lead.mindset_lock_state !== 'leader_assigned'
      if (!ready) return
      if (Object.prototype.hasOwnProperty.call(mindsetPreviewByLeadId, lead.id)) return
      ensureMindsetPreview(lead)
    })
  }, [mindsetLeads, mindsetPreviewByLeadId, ensureMindsetPreview])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Mindset Lock</h2>
        <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-ds-caption font-semibold tabular-nums text-muted-foreground">
          {mindsetLeads.length}
        </span>
      </div>
      <Grid
        leads={mindsetLeads}
        pm={pm}
        patchBusyLeadId={patchBusyLeadId}
        mindsetBusyLeadId={mindsetBusyLeadId}
        mindsetPreviewByLeadId={mindsetPreviewByLeadId}
        onRequestMindsetSend={onRequestMindsetSend}
        empty="No mindset-lock leads yet"
      />
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
              <span key={label as string} className={cn('rounded-full border px-2.5 py-0.5 text-ds-caption font-medium', cls as string)}>{label}: {count}</span>)}
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
                  <p className="rounded-lg border border-dashed border-border/70 px-3 py-6 text-center text-ds-caption text-muted-foreground">
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
                  <span className={cn('rounded-full border px-2 py-0.5 text-ds-caption font-semibold', badge)}>{items.length}</span>
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
  const qc = useQueryClient()
  const { data, isPending, isError, error, refetch } = useWorkboardQuery(true)
  const pm = usePatchLeadMutation()
  const patchBusyLeadId =
    pm.isPending && pm.variables && typeof pm.variables.id === 'number' ? pm.variables.id : null
  const [mindsetBusyLeadId, setMindsetBusyLeadId] = useState<number | null>(null)
  const [mindsetErr, setMindsetErr] = useState<string | null>(null)
  const [mindsetPreviewByLeadId, setMindsetPreviewByLeadId] = useState<
    Record<number, MindsetLockPreviewResponse | undefined>
  >({})
  const [confirmLead, setConfirmLead] = useState<LeadPublic | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
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

  useEffect(() => {
    if (!toastMsg) return
    const id = window.setTimeout(() => setToastMsg(null), 2200)
    return () => window.clearTimeout(id)
  }, [toastMsg])

  const ensureMindsetPreview = useCallback((lead: LeadPublic) => {
    let shouldFetch = false
    setMindsetPreviewByLeadId((prev) => {
      if (Object.prototype.hasOwnProperty.call(prev, lead.id)) return prev
      shouldFetch = true
      return { ...prev, [lead.id]: undefined }
    })
    if (!shouldFetch) return
    void (async () => {
      try {
        const p = await fetchMindsetLockPreview(lead.id)
        setMindsetPreviewByLeadId((prev) => ({ ...prev, [lead.id]: p }))
      } catch {
        setMindsetPreviewByLeadId((prev) => ({ ...prev, [lead.id]: undefined }))
      }
    })()
  }, [])

  async function completeMindsetLock(leadId: number) {
    setMindsetErr(null)
    setMindsetBusyLeadId(leadId)
    try {
      await postMindsetLockComplete(leadId)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['workboard'] }),
        qc.invalidateQueries({ queryKey: ['leads'] }),
      ])
      await refetch()
      setMindsetPreviewByLeadId((prev) => {
        const next = { ...prev }
        delete next[leadId]
        return next
      })
      setToastMsg('Lead sent to leader')
    } catch (e) {
      setMindsetErr(e instanceof Error ? e.message : 'Could not complete mindset lock')
    } finally {
      setMindsetBusyLeadId(null)
      setConfirmLead(null)
    }
  }

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
            className="field-input w-full pl-9 pr-3"/>
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
        <p className="text-ds-caption text-destructive" role="alert">
          {pm.error instanceof Error ? pm.error.message : 'Could not update lead'}
        </p>
      )}
      {mindsetErr ? (
        <p className="text-ds-caption text-destructive" role="alert">
          {mindsetErr}
        </p>
      ) : null}

      {/* Main content */}
      {data && !isPending && (
        role === 'team'
          ? (
            <TeamView
              cols={cols}
              pm={pm}
              patchBusyLeadId={patchBusyLeadId}
              mindsetBusyLeadId={mindsetBusyLeadId}
              mindsetPreviewByLeadId={mindsetPreviewByLeadId}
              ensureMindsetPreview={ensureMindsetPreview}
              onRequestMindsetSend={(lead) => setConfirmLead(lead)}
              search={search}
            />
          )
          : <AdminView cols={cols} pm={pm} patchBusyLeadId={patchBusyLeadId} search={search} />
      )}
      {confirmLead ? (
        <div className="keyboard-safe-modal fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4">
          <div className="keyboard-safe-sheet w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-2xl">
            <h3 className="text-base font-semibold text-foreground">Send to Leader?</h3>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>You have completed mindset call (5–10 min)</li>
              <li>This action will transfer lead to your leader</li>
              <li>You won’t be able to edit after this</li>
            </ul>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setConfirmLead(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void completeMindsetLock(confirmLead.id)}
                disabled={mindsetBusyLeadId === confirmLead.id}
              >
                {mindsetBusyLeadId === confirmLead.id ? 'Sending…' : 'Confirm & Send'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {toastMsg ? (
        <div className="fixed bottom-24 right-4 z-[85] rounded-md border border-emerald-400/35 bg-emerald-400/15 px-3 py-2 text-ds-caption font-semibold text-emerald-200 shadow-lg">
          {toastMsg}
        </div>
      ) : null}
    </div>
  )
}
