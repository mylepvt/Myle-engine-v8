import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ClipboardList,
  MessageSquare,
  Phone,
  RefreshCw,
  Send,
  Settings,
  Smartphone,
  Users,
  WifiOff,
  XCircle,
} from 'lucide-react'

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
import {
  useSendBroadcastMutation,
  useSendCustomMessageMutation,
  useSendInsightsMutation,
  useTriggerDailySummaryMutation,
  useWhatsAppLeadersQuery,
  useWhatsAppLogsQuery,
  useWhatsAppStatusQuery,
  type BroadcastResultItem,
  type LogFilters,
  type WhatsAppLogItem,
} from '@/hooks/use-whatsapp-panel-query'
import { apiFetch } from '@/lib/api'
import { type ReminderResult, type SendRemindersResponse } from '@/hooks/use-today-pulse-query'
import { cn } from '@/lib/utils'

type Props = { title: string }

const PAGE_SIZE = 50

const TYPE_LABELS: Record<string, string> = {
  removal_outreach: 'Removal',
  leader_alert: 'Leader Alert',
  command_reply: 'Cmd Reply',
  inbound_member: 'Member Reply',
  inbound_leader: 'Leader Cmd',
  inbound_unknown: 'Unknown',
  report_reminder: 'Report Reminder',
}

const TYPE_COLORS: Record<string, string> = {
  removal_outreach: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300',
  leader_alert: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  command_reply: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300',
  inbound_member: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
  inbound_leader: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300',
  inbound_unknown: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
  report_reminder: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function StatusBadge({ item }: { item: WhatsAppLogItem }) {
  if (item.status === 'sent') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
        <CheckCircle2 className="h-3 w-3" /> Sent
      </span>
    )
  }
  if (item.status === 'received') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700">
        <ArrowDown className="h-3 w-3" /> Received
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
      <XCircle className="h-3 w-3" /> Failed
    </span>
  )
}

function LogRow({ item }: { item: WhatsAppLogItem }) {
  const [showError, setShowError] = useState(false)
  const isOut = item.direction === 'out'

  return (
    <>
      <TableRow
        className={cn(
          'text-sm',
          item.status === 'failed' && 'bg-red-50 hover:bg-red-100',
        )}
        onClick={() => item.error && setShowError((v) => !v)}
        style={{ cursor: item.error ? 'pointer' : undefined }}
      >
        <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
          {formatTime(item.created_at)}
        </TableCell>
        <TableCell>
          {isOut ? (
            <ArrowUp className="h-4 w-4 text-orange-500" />
          ) : (
            <ArrowDown className="h-4 w-4 text-green-600" />
          )}
        </TableCell>
        <TableCell>
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-xs font-medium',
              TYPE_COLORS[item.message_type] ?? 'bg-gray-100 text-gray-600',
            )}
          >
            {TYPE_LABELS[item.message_type] ?? item.message_type}
          </span>
        </TableCell>
        <TableCell className="font-mono text-xs text-muted-foreground">
          {item.phone ?? '—'}
        </TableCell>
        <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
          {item.message_preview ?? '—'}
        </TableCell>
        <TableCell>
          <StatusBadge item={item} />
        </TableCell>
      </TableRow>
      {showError && item.error && (
        <TableRow className="bg-red-50">
          <TableCell colSpan={6} className="py-2 text-xs text-red-700">
            <span className="font-medium">Error:</span> {item.error}
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

export function WhatsAppPanelPage({ title }: Props) {
  const qc = useQueryClient()
  const [filters, setFilters] = useState<LogFilters>({ limit: PAGE_SIZE, offset: 0 })
  const [page, setPage] = useState(0)
  const [customPhone, setCustomPhone] = useState('')
  const [customMessage, setCustomMessage] = useState('')
  const [customResult, setCustomResult] = useState<string | null>(null)
  const [summaryResult, setSummaryResult] = useState<string | null>(null)
  const [broadcastRecipients, setBroadcastRecipients] = useState<'leaders' | 'team' | 'all'>('leaders')
  const [broadcastMessage, setBroadcastMessage] = useState('')
  const [broadcastResults, setBroadcastResults] = useState<BroadcastResultItem[] | null>(null)
  const [broadcastSummary, setBroadcastSummary] = useState<{ sent: number; failed: number; no_phone: number } | null>(null)
  const sendBroadcast = useSendBroadcastMutation()
  const [insightsRecipients, setInsightsRecipients] = useState<'leaders' | 'team' | 'all'>('team')
  const [insightsPeriod, setInsightsPeriod] = useState<7 | 30>(7)
  const [insightsResults, setInsightsResults] = useState<BroadcastResultItem[] | null>(null)
  const [insightsSummary, setInsightsSummary] = useState<{ sent: number; failed: number; no_phone: number } | null>(null)
  const sendInsights = useSendInsightsMutation()
  const [reminderSending, setReminderSending] = useState(false)
  const [reminderSummary, setReminderSummary] = useState<Omit<SendRemindersResponse, 'results'> | null>(null)
  const [reminderResults, setReminderResults] = useState<ReminderResult[] | null>(null)
  const [reminderError, setReminderError] = useState<string | null>(null)

  // Template settings
  const TEMPLATE_DEFS = [
    { key: 'report_reminder', label: 'Report Reminder', desc: 'Daily report not submitted — to members' },
    { key: 'member_removal_notice', label: 'Member Removal Notice', desc: 'WhatsApp to removed member' },
    { key: 'leader_member_removed', label: 'Leader: Member Removed', desc: 'Alert to leader when member is removed' },
    { key: 'leader_grace_requested', label: 'Leader: Grace Requested', desc: 'Alert to leader on grace request' },
    { key: 'leader_new_member', label: 'Leader: New Member Approved', desc: 'Alert to leader on new approval' },
    { key: 'daily_team_summary', label: 'Daily Summary (Missing)', desc: 'Summary to leader with missing members' },
    { key: 'daily_team_summary_all_clear', label: 'Daily Summary (All Clear)', desc: 'Summary to leader when all submitted' },
  ] as const
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [tplValues, setTplValues] = useState<Record<string, string>>({})
  const [tplSaving, setTplSaving] = useState(false)
  const [tplMsg, setTplMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!templatesOpen) return
    apiFetch('/api/v1/settings-enhanced/system/app-settings')
      .then((r) => r.json())
      .then((data: { settings: Record<string, string> }) => {
        const init: Record<string, string> = {}
        for (const def of TEMPLATE_DEFS) {
          init[`whatsapp.${def.key}_template_name`] = data.settings[`whatsapp.${def.key}_template_name`] ?? ''
          init[`whatsapp.${def.key}_template_lang`] = data.settings[`whatsapp.${def.key}_template_lang`] ?? ''
        }
        setTplValues(init)
      })
      .catch(() => { /* settings load failed silently */ })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templatesOpen])

  async function saveTemplates() {
    setTplSaving(true)
    setTplMsg(null)
    try {
      for (const [key, value] of Object.entries(tplValues)) {
        if (value.trim() === '' && !key.endsWith('_lang')) continue
        await apiFetch('/api/v1/settings-enhanced/system/app-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value: value.trim() }),
        })
      }
      setTplMsg('✓ Templates saved')
    } catch {
      setTplMsg('✗ Save failed')
    } finally {
      setTplSaving(false)
    }
  }

  async function sendReportReminders() {
    setReminderSending(true)
    setReminderError(null)
    setReminderSummary(null)
    setReminderResults(null)
    try {
      const res = await apiFetch('/api/v1/admin/send-report-reminders', { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: SendRemindersResponse = await res.json()
      setReminderSummary({ sent: data.sent, failed: data.failed, no_phone: data.no_phone })
      setReminderResults(data.results)
      void qc.invalidateQueries({ queryKey: ['whatsapp'] })
    } catch (err) {
      setReminderError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setReminderSending(false)
    }
  }

  const [showLeaders, setShowLeaders] = useState(false)
  const { data: status, isLoading: statusLoading } = useWhatsAppStatusQuery()
  const { data: logs, isLoading: logsLoading, isFetching } = useWhatsAppLogsQuery(filters)
  const { data: leadersData, isLoading: leadersLoading } = useWhatsAppLeadersQuery(showLeaders)
  const sendCustom = useSendCustomMessageMutation()
  const triggerSummary = useTriggerDailySummaryMutation()

  function applyFilter(patch: Partial<LogFilters>) {
    setPage(0)
    setFilters((f) => ({ ...f, ...patch, offset: 0 }))
  }

  function goPage(n: number) {
    setPage(n)
    setFilters((f) => ({ ...f, offset: n * PAGE_SIZE }))
  }

  function refresh() {
    void qc.invalidateQueries({ queryKey: ['whatsapp'] })
  }

  const totalPages = logs ? Math.ceil(logs.total / PAGE_SIZE) : 0

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{title}</h1>
        <Button size="sm" variant="outline" onClick={refresh} disabled={isFetching}>
          <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', isFetching && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Connection status card */}
      {statusLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : status ? (
        <Card className={cn(
          'border-l-4',
          !status.configured
            ? 'border-l-gray-400'
            : status.connected
            ? 'border-l-green-500'
            : 'border-l-red-500',
        )}>
          <CardContent className="flex items-center gap-4 py-4">
            {!status.configured ? (
              <WifiOff className="h-8 w-8 text-muted-foreground" />
            ) : status.connected ? (
              <MessageSquare className="h-8 w-8 text-green-600" />
            ) : (
              <AlertCircle className="h-8 w-8 text-red-500" />
            )}
            <div>
              {!status.configured ? (
                <p className="font-medium text-muted-foreground">WhatsApp not configured</p>
              ) : status.connected ? (
                <>
                  <p className="font-medium text-green-700">Connected</p>
                  <p className="text-sm text-muted-foreground">
                    <Phone className="mr-1 inline h-3 w-3" />
                    {status.display_phone_number ?? '—'}
                    {status.verified_name && (
                      <span className="ml-2 text-xs text-muted-foreground">({status.verified_name})</span>
                    )}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium text-red-700">Not connected</p>
                  {status.error && <p className="text-xs text-red-600">{status.error}</p>}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Today's stats */}
      {logsLoading ? (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : logs ? (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Card>
            <CardHeader className="pb-1 px-3 pt-3 sm:px-6">
              <CardTitle className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">
                Sent Today
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-3 px-3 sm:px-6">
              <p className="text-xl sm:text-2xl font-bold text-green-700">{logs.sent_today}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 px-3 pt-3 sm:px-6">
              <CardTitle className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">
                Failed Today
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-3 px-3 sm:px-6">
              <p className={cn('text-xl sm:text-2xl font-bold', logs.failed_today > 0 ? 'text-red-600' : 'text-muted-foreground')}>
                {logs.failed_today}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 px-3 pt-3 sm:px-6">
              <CardTitle className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">
                Received Today
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-3 px-3 sm:px-6">
              <p className="text-xl sm:text-2xl font-bold text-blue-700">{logs.received_today}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Template Settings */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Settings className="h-4 w-4 text-muted-foreground" />
              Approved Template Settings
            </CardTitle>
            <Button size="sm" variant="ghost" onClick={() => setTemplatesOpen((v) => !v)}>
              {templatesOpen ? 'Hide' : 'Configure'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Set approved Meta template names so messages work outside the 24-hour window.
          </p>
        </CardHeader>
        {templatesOpen && (
          <CardContent className="pb-4 space-y-4">
            {TEMPLATE_DEFS.map((def) => {
              const nameKey = `whatsapp.${def.key}_template_name`
              const langKey = `whatsapp.${def.key}_template_lang`
              return (
                <div key={def.key} className="space-y-1.5">
                  <div>
                    <p className="text-xs font-medium text-foreground">{def.label}</p>
                    <p className="text-[11px] text-muted-foreground">{def.desc}</p>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="template_name (e.g. myle_report_reminder)"
                      value={tplValues[nameKey] ?? ''}
                      onChange={(e) => setTplValues((v) => ({ ...v, [nameKey]: e.target.value }))}
                      className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                    />
                    <input
                      type="text"
                      placeholder="en"
                      value={tplValues[langKey] ?? ''}
                      onChange={(e) => setTplValues((v) => ({ ...v, [langKey]: e.target.value }))}
                      className="w-16 rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                    />
                  </div>
                </div>
              )
            })}
            <div className="flex items-center gap-3 pt-1">
              <Button size="sm" disabled={tplSaving} onClick={() => void saveTemplates()}>
                {tplSaving ? 'Saving…' : 'Save All Templates'}
              </Button>
              {tplMsg && (
                <span className={cn('text-xs', tplMsg.startsWith('✓') ? 'text-green-700' : 'text-red-600')}>
                  {tplMsg}
                </span>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Manual Controls */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {/* Send custom message — one person OR broadcast */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Send className="h-4 w-4 text-blue-600" />
              Send Custom Message
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pb-4">
            {/* Recipient tabs */}
            <div className="flex gap-1 rounded-lg border border-input bg-muted/40 p-1">
              {(['one', 'leaders', 'team', 'all'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    if (r === 'one') {
                      setBroadcastRecipients('leaders')
                    } else {
                      setBroadcastRecipients(r)
                    }
                    setCustomResult(null)
                    setBroadcastResults(null)
                    setBroadcastSummary(null)
                  }}
                  className={cn(
                    'flex-1 rounded-md py-1 text-xs font-medium transition-colors',
                    (r === 'one' && customPhone !== '' && broadcastResults === null && broadcastSummary === null) ||
                    (r !== 'one' && broadcastRecipients === r && (broadcastResults !== null || broadcastSummary !== null || broadcastMessage !== ''))
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {r === 'one' ? 'One Person' : r === 'leaders' ? 'All Leaders' : r === 'team' ? 'All Team' : 'Everyone'}
                </button>
              ))}
            </div>

            {/* One person mode */}
            <div className={broadcastResults !== null || broadcastSummary !== null ? 'hidden' : undefined}>
              <input
                type="text"
                placeholder="+91 98765 43210"
                value={customPhone}
                onChange={(e) => { setCustomPhone(e.target.value); setCustomResult(null) }}
                className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring mb-2"
              />
              <textarea
                placeholder="Type your message here..."
                value={customMessage}
                onChange={(e) => { setCustomMessage(e.target.value); setCustomResult(null) }}
                rows={3}
                className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
              <Button
                size="sm"
                className="w-full mt-2"
                disabled={!customPhone.trim() || !customMessage.trim() || sendCustom.isPending}
                onClick={() => {
                  sendCustom.mutate(
                    { phone: customPhone.trim(), message: customMessage.trim() },
                    {
                      onSuccess: (r) => {
                        if (r.ok) { setCustomResult('✓ Sent successfully'); setCustomPhone(''); setCustomMessage('') }
                        else setCustomResult(`✗ ${r.error ?? 'Failed'}`)
                      },
                      onError: (e) => setCustomResult(`✗ ${e.message}`),
                    },
                  )
                }}
              >
                {sendCustom.isPending ? 'Sending…' : 'Send Message'}
              </Button>
              {customResult && (
                <p className={cn('mt-1 text-xs', customResult.startsWith('✓') ? 'text-green-700' : 'text-red-600')}>
                  {customResult}
                </p>
              )}
            </div>

            {/* Broadcast mode — shown when a group tab is selected */}
            <div className={broadcastResults === null && broadcastSummary === null && customPhone === '' ? undefined : 'hidden'}>
              <div className="mb-1 text-xs text-muted-foreground">
                {broadcastRecipients === 'leaders' ? 'Sabhi leaders ko bhejega' : broadcastRecipients === 'team' ? 'Sabhi team members ko bhejega' : 'Sabhi leaders + team members ko bhejega'}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Broadcast card — full width when active */}
        <Card className="sm:col-span-2 lg:col-span-3">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4 text-indigo-600" />
              Broadcast Message
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pb-4">
            {/* Recipient selector */}
            <div className="flex gap-2">
              {(['leaders', 'team', 'all'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => { setBroadcastRecipients(r); setBroadcastResults(null); setBroadcastSummary(null) }}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    broadcastRecipients === r
                      ? 'border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                      : 'border-border text-muted-foreground hover:border-indigo-400 hover:text-foreground',
                  )}
                >
                  {r === 'leaders' ? '👔 All Leaders' : r === 'team' ? '👥 All Team' : '📢 Everyone'}
                </button>
              ))}
            </div>

            <textarea
              placeholder="Type your message here — sabhi selected members ko jaayega..."
              value={broadcastMessage}
              onChange={(e) => { setBroadcastMessage(e.target.value); setBroadcastResults(null); setBroadcastSummary(null) }}
              rows={3}
              className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />

            <Button
              size="sm"
              className="border-indigo-500/40 bg-indigo-500/10 text-indigo-700 hover:bg-indigo-500/20 dark:text-indigo-300"
              variant="outline"
              disabled={!broadcastMessage.trim() || sendBroadcast.isPending}
              onClick={() => {
                sendBroadcast.mutate(
                  { message: broadcastMessage.trim(), recipients: broadcastRecipients },
                  {
                    onSuccess: (r) => { setBroadcastSummary({ sent: r.sent, failed: r.failed, no_phone: r.no_phone }); setBroadcastResults(r.results) },
                    onError: (e) => { setBroadcastSummary({ sent: 0, failed: 0, no_phone: 0 }); setBroadcastResults([]); console.error(e) },
                  },
                )
              }}
            >
              {sendBroadcast.isPending
                ? 'Bhej raha hoon…'
                : broadcastRecipients === 'leaders' ? 'Send to All Leaders'
                : broadcastRecipients === 'team' ? 'Send to All Team'
                : 'Send to Everyone'}
            </Button>

            {broadcastSummary && (
              <div className="flex flex-wrap gap-3 text-xs">
                <span className="font-medium text-green-700">✓ {broadcastSummary.sent} sent</span>
                {broadcastSummary.failed > 0 && <span className="font-medium text-red-600">✗ {broadcastSummary.failed} failed</span>}
                {broadcastSummary.no_phone > 0 && <span className="text-muted-foreground">📵 {broadcastSummary.no_phone} no phone</span>}
              </div>
            )}

            {broadcastResults && broadcastResults.length > 0 && (
              <div className="max-h-56 overflow-y-auto rounded border border-border/50 bg-muted/30">
                {broadcastResults.map((r) => (
                  <div key={r.user_id} className="flex items-center gap-2 border-b border-border/30 px-3 py-1.5 last:border-0 text-xs">
                    {r.status === 'sent'
                      ? <CheckCircle2 className="h-3 w-3 shrink-0 text-green-600" />
                      : r.status === 'no_phone'
                      ? <Smartphone className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                      : <XCircle className="h-3 w-3 shrink-0 text-red-500" />}
                    <span className="flex-1 truncate font-medium">{r.name}</span>
                    <span className="text-muted-foreground">{r.phone_tail !== '—' ? `…${r.phone_tail}` : '—'}</span>
                    <span className={cn('font-medium', r.status === 'sent' ? 'text-green-600' : r.status === 'no_phone' ? 'text-muted-foreground/50' : 'text-red-500')}>
                      {r.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Trigger daily summary */}
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4 text-purple-600" />
              Trigger Daily Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pb-4">
            <p className="text-xs text-muted-foreground">
              Send the daily team report summary to all leaders right now — without waiting for 10 PM.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={triggerSummary.isPending}
              onClick={() => {
                setSummaryResult(null)
                triggerSummary.mutate(undefined, {
                  onSuccess: (r) => setSummaryResult(`✓ Sent to ${r.sent_to} of ${r.total_leaders ?? r.sent_to} leaders`),
                  onError: (e) => setSummaryResult(`✗ ${e.message}`),
                })
              }}
            >
              {triggerSummary.isPending ? 'Sending…' : 'Send to All Leaders Now'}
            </Button>
            {summaryResult && (
              <p className={cn('text-xs', summaryResult.startsWith('✓') ? 'text-green-700' : 'text-red-600')}>
                {summaryResult}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Send report reminders */}
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <ClipboardList className="h-4 w-4 text-amber-600" />
              Send Report Reminders
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pb-4">
            <p className="text-xs text-muted-foreground">
              Aaj ki report submit nahi ki — unhe abhi WhatsApp reminder bhejo. Jo pehle se reminded hain wo skip honge.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="w-full border-amber-500/40 text-amber-700 hover:bg-amber-50"
              disabled={reminderSending}
              onClick={() => void sendReportReminders()}
            >
              {reminderSending ? 'Bhej raha hoon…' : 'Send Reminders Now'}
            </Button>
            {reminderError && (
              <p className="text-xs text-red-600">✗ {reminderError}</p>
            )}
            {reminderSummary && (
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="font-medium text-green-700">✓ {reminderSummary.sent} sent</span>
                {reminderSummary.failed > 0 && (
                  <span className="font-medium text-red-600">✗ {reminderSummary.failed} failed</span>
                )}
                {reminderSummary.no_phone > 0 && (
                  <span className="text-muted-foreground">📵 {reminderSummary.no_phone} no phone</span>
                )}
                {reminderSummary.sent === 0 && reminderSummary.failed === 0 && reminderSummary.no_phone === 0 && (
                  <span className="text-muted-foreground">Koi pending nahi</span>
                )}
              </div>
            )}
            {reminderResults && reminderResults.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded border border-border/50 bg-muted/30">
                {reminderResults.map((r) => (
                  <div key={r.user_id} className="flex items-center gap-2 border-b border-border/30 px-2 py-1 last:border-0 text-xs">
                    {r.status === 'sent' || r.status === 'stub'
                      ? <CheckCircle2 className="h-3 w-3 shrink-0 text-green-600" />
                      : r.status === 'no_phone'
                      ? <Smartphone className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                      : <XCircle className="h-3 w-3 shrink-0 text-red-500" />}
                    <span className="flex-1 truncate font-medium">{r.name}</span>
                    <span className="text-muted-foreground">{r.phone_tail !== '—' ? `…${r.phone_tail}` : '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Personal Insights card */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <ClipboardList className="h-4 w-4 text-emerald-600" />
            Send Personal Insights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pb-4">
          <p className="text-xs text-muted-foreground">
            Har member ko uski apni performance analysis bhejo — reports, calls, streak, miss pattern sab.
          </p>

          {/* Period + Recipients */}
          <div className="flex flex-wrap gap-3">
            <div className="flex gap-1 rounded-lg border border-input bg-muted/40 p-1">
              {([7, 30] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => { setInsightsPeriod(p); setInsightsResults(null); setInsightsSummary(null) }}
                  className={cn(
                    'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                    insightsPeriod === p ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {p} days
                </button>
              ))}
            </div>
            <div className="flex gap-1 rounded-lg border border-input bg-muted/40 p-1">
              {(['leaders', 'team', 'all'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => { setInsightsRecipients(r); setInsightsResults(null); setInsightsSummary(null) }}
                  className={cn(
                    'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                    insightsRecipients === r ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {r === 'leaders' ? 'Leaders' : r === 'team' ? 'Team' : 'Everyone'}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="rounded border border-emerald-500/20 bg-emerald-500/5 p-3 text-[11px] text-muted-foreground font-mono whitespace-pre-line">
            {insightsPeriod === 7
              ? `Hi Rahul,\n\nHere's your performance summary for the last 7 days:\n✅ Reports submitted: 5/7\n🔥 Current streak: 3 days\n📞 Total calls made: 42\n⚠️ Days missed: Sat, Sun\n💪 Best day: Mon (12 calls)\n\nKeep it up — consistency is everything.\n\n— Myle Team`
              : `Hi Rahul,\n\nHere's your 30-day performance analysis:\n✅ Reports submitted: 22/30\n🔥 Best streak: 8 days\n📞 Average calls/day: 9\n\n📊 Weekly breakdown (oldest → recent):\n  Week 1: 38 calls · 6/7 reports\n  Week 2: 44 calls · 7/7 reports\n  Week 3: 31 calls · 4/7 reports\n  Week 4: 42 calls · 5/7 reports\n⚠️ Pattern noticed: Reports were missed on Saturday in 3 out of the last 4 weeks.\n💡 Try to stay consistent on that day — small habits make big results.\n\n— Myle Team`}
          </div>

          <Button
            size="sm"
            variant="outline"
            className="w-full border-emerald-500/40 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400"
            disabled={sendInsights.isPending}
            onClick={() => {
              sendInsights.mutate(
                { recipients: insightsRecipients, period: insightsPeriod },
                {
                  onSuccess: (r) => { setInsightsSummary({ sent: r.sent, failed: r.failed, no_phone: r.no_phone }); setInsightsResults(r.results) },
                  onError: (e) => { setInsightsSummary({ sent: 0, failed: 0, no_phone: 0 }); setInsightsResults([]); console.error(e) },
                },
              )
            }}
          >
            {sendInsights.isPending ? 'Bhej raha hoon…' : `Send ${insightsPeriod}-day Insights`}
          </Button>

          {insightsSummary && (
            <div className="flex flex-wrap gap-3 text-xs">
              <span className="font-medium text-green-700">✓ {insightsSummary.sent} sent</span>
              {insightsSummary.failed > 0 && <span className="font-medium text-red-600">✗ {insightsSummary.failed} failed</span>}
              {insightsSummary.no_phone > 0 && <span className="text-muted-foreground">📵 {insightsSummary.no_phone} no phone</span>}
            </div>
          )}

          {insightsResults && insightsResults.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded border border-border/50 bg-muted/30">
              {insightsResults.map((r) => (
                <div key={r.user_id} className="flex items-center gap-2 border-b border-border/30 px-3 py-1.5 last:border-0 text-xs">
                  {r.status === 'sent'
                    ? <CheckCircle2 className="h-3 w-3 shrink-0 text-green-600" />
                    : r.status === 'no_phone'
                    ? <Smartphone className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                    : <XCircle className="h-3 w-3 shrink-0 text-red-500" />}
                  <span className="flex-1 truncate font-medium">{r.name}</span>
                  <span className="text-muted-foreground">{r.phone_tail !== '—' ? `…${r.phone_tail}` : '—'}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Leaders phone status */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4 text-indigo-600" />
              Leaders WhatsApp Status
              {leadersData && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {leadersData.wa_enabled}/{leadersData.total} have phone
                  {leadersData.no_phone > 0 && (
                    <span className="ml-1 text-red-600 font-medium">· {leadersData.no_phone} missing</span>
                  )}
                </span>
              )}
            </CardTitle>
            <Button size="sm" variant="ghost" onClick={() => setShowLeaders((v) => !v)}>
              {showLeaders ? 'Hide' : 'Show'}
            </Button>
          </div>
        </CardHeader>
        {showLeaders && (
          <CardContent className="pb-4">
            {leadersLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-7 w-full" />)}
              </div>
            ) : !leadersData || leadersData.leaders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No leaders found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone (raw)</TableHead>
                    <TableHead>Normalized</TableHead>
                    <TableHead className="w-28">WA Commands</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leadersData.leaders.map((l) => (
                    <TableRow key={l.id} className={!l.wa_enabled ? 'bg-red-50' : undefined}>
                      <TableCell className="text-sm font-medium">{l.name}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {l.phone_raw ?? <span className="text-red-500 font-medium">NOT SET</span>}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {l.phone_normalized ?? '—'}
                      </TableCell>
                      <TableCell>
                        {l.wa_enabled ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-700 font-medium">
                            <CheckCircle2 className="h-3 w-3" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
                            <XCircle className="h-3 w-3" /> No phone
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        )}
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {/* Direction */}
        {(['', 'out', 'in'] as const).map((d) => (
          <Button
            key={d || 'all-dir'}
            size="sm"
            variant={filters.direction === d ? 'default' : 'outline'}
            onClick={() => applyFilter({ direction: d })}
          >
            {d === '' ? 'All' : d === 'out' ? '↑ Outbound' : '↓ Inbound'}
          </Button>
        ))}
        <span className="self-center text-muted-foreground">|</span>
        {/* Status */}
        {(['', 'sent', 'failed', 'received'] as const).map((s) => (
          <Button
            key={s || 'all-status'}
            size="sm"
            variant={filters.status === s ? 'default' : 'outline'}
            onClick={() => applyFilter({ status: s })}
          >
            {s === '' ? 'All status' : s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
        <span className="self-center text-muted-foreground">|</span>
        {/* Type */}
        {(['', 'removal_outreach', 'report_reminder', 'leader_alert', 'command_reply', 'inbound_member', 'inbound_leader', 'inbound_unknown'] as const).map((t) => (
          <Button
            key={t || 'all-type'}
            size="sm"
            variant={filters.message_type === t ? 'default' : 'outline'}
            onClick={() => applyFilter({ message_type: t })}
          >
            {t === '' ? 'All types' : (TYPE_LABELS[t] ?? t)}
          </Button>
        ))}
      </div>

      {/* Log table */}
      <Card>
        <CardContent className="p-0">
          {logsLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : !logs || logs.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <MessageSquare className="mb-3 h-10 w-10 opacity-30" />
              <p className="text-sm">No messages yet</p>
              <p className="text-xs">Activity will appear here as WhatsApp messages are sent or received.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Time</TableHead>
                    <TableHead className="w-10">Dir</TableHead>
                    <TableHead className="w-32">Type</TableHead>
                    <TableHead className="w-36">Phone</TableHead>
                    <TableHead>Message preview</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.items.map((item) => <LogRow key={item.id} item={item} />)}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {logs && totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, logs.total)} of {logs.total}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => goPage(page - 1)}>
              Previous
            </Button>
            <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => goPage(page + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
