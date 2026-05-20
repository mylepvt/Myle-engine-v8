import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  MessageSquare,
  Phone,
  RefreshCw,
  WifiOff,
  XCircle,
} from 'lucide-react'

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
import {
  useWhatsAppLogsQuery,
  useWhatsAppStatusQuery,
  type LogFilters,
  type WhatsAppLogItem,
} from '@/hooks/use-whatsapp-panel-query'
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
}

const TYPE_COLORS: Record<string, string> = {
  removal_outreach: 'bg-orange-100 text-orange-800',
  leader_alert: 'bg-blue-100 text-blue-800',
  command_reply: 'bg-purple-100 text-purple-800',
  inbound_member: 'bg-green-100 text-green-800',
  inbound_leader: 'bg-indigo-100 text-indigo-800',
  inbound_unknown: 'bg-gray-100 text-gray-600',
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

  const { data: status, isLoading: statusLoading } = useWhatsAppStatusQuery()
  const { data: logs, isLoading: logsLoading, isFetching } = useWhatsAppLogsQuery(filters)

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
              <WifiOff className="h-8 w-8 text-gray-400" />
            ) : status.connected ? (
              <MessageSquare className="h-8 w-8 text-green-600" />
            ) : (
              <AlertCircle className="h-8 w-8 text-red-500" />
            )}
            <div>
              {!status.configured ? (
                <p className="font-medium text-gray-600">WhatsApp not configured</p>
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
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : logs ? (
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardHeader className="pb-1 pt-3">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Sent Today
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-3">
              <p className="text-2xl font-bold text-green-700">{logs.sent_today}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-3">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Failed Today
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-3">
              <p className={cn('text-2xl font-bold', logs.failed_today > 0 ? 'text-red-600' : 'text-muted-foreground')}>
                {logs.failed_today}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-3">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Received Today
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-3">
              <p className="text-2xl font-bold text-blue-700">{logs.received_today}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

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
        {(['', 'removal_outreach', 'leader_alert', 'command_reply', 'inbound_member', 'inbound_leader', 'inbound_unknown'] as const).map((t) => (
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
            <Table>
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
