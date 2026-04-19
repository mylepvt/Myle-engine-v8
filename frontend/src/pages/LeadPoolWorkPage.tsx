import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  LEAD_STATUS_OPTIONS,
  usePatchLeadMutation,
} from '@/hooks/use-leads-query'
import { useCrmPoolClaim } from '@/hooks/use-crm-query'
import {
  useLeadPoolDefaultsMutation,
  useLeadPoolDefaultsQuery,
  useLeadPoolQuery,
  type PoolLead,
} from '@/hooks/use-lead-pool-query'
import { LeadContactActions } from '@/components/leads/LeadContactActions'
import { useWalletMeQuery } from '@/hooks/use-wallet-query'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import { apiFetch } from '@/lib/api'

type Props = {
  title: string
}

function statusLabel(value: string): string {
  return LEAD_STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value
}

function formatRupees(cents: number): string {
  return `₹${(cents / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

export function LeadPoolWorkPage({ title }: Props) {
  const qc = useQueryClient()
  const { role } = useDashboardShellRole()
  const { data, isPending, isError, error, refetch } = useLeadPoolQuery()
  const { data: poolDefaults } = useLeadPoolDefaultsQuery(role === 'admin')
  const poolDefaultsMut = useLeadPoolDefaultsMutation()
  const { data: walletData } = useWalletMeQuery(true)
  const claimMut = useCrmPoolClaim()
  const patchMut = usePatchLeadMutation()

  // Confirm dialog state: which lead is being claimed
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [batchCountStr, setBatchCountStr] = useState('1')
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false)
  // Admin: price input per lead
  const [priceInputs, setPriceInputs] = useState<Record<number, string>>({})
  const [poolFile, setPoolFile] = useState<File | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  const [importNote, setImportNote] = useState<string | null>(null)
  const [testBusy, setTestBusy] = useState(false)
  const [testNote, setTestNote] = useState<string | null>(null)
  const [defaultRupees, setDefaultRupees] = useState('')
  const [defaultPriceHydrated, setDefaultPriceHydrated] = useState(false)

  const walletBalance = walletData?.balance_cents ?? 0

  useEffect(() => {
    if (!poolDefaults || defaultPriceHydrated) return
    setDefaultRupees(String((poolDefaults.default_pool_price_cents ?? 0) / 100))
    setDefaultPriceHydrated(true)
  }, [poolDefaults, defaultPriceHydrated])

  async function handleSaveDefaultPoolPrice() {
    const rupees = parseFloat(defaultRupees)
    if (isNaN(rupees) || rupees < 0) return
    try {
      await poolDefaultsMut.mutateAsync({
        default_pool_price_cents: Math.round(rupees * 100),
      })
    } catch {
      /* surfaced below */
    }
  }

  async function handleClaim(leadId: number) {
    try {
      await claimMut.mutateAsync({
        leadId,
        idempotencyKey: `claim-${leadId}-${Date.now()}`,
        pipelineKind: 'PERSONAL',
      })
      setConfirmId(null)
    } catch {
      /* error surfaced below */
    }
  }

  const maxBatch = data ? Math.min(50, data.total) : 0

  const batchFifoEstimateCents = useMemo(() => {
    if (!data?.items.length) return 0
    const n = Math.min(50, Math.max(1, parseInt(batchCountStr, 10) || 1), data.total)
    const fifo = [...data.items].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )
    const slice = fifo.slice(0, Math.min(n, fifo.length))
    return slice.reduce((s, l) => s + (l.pool_price_cents ?? 0), 0)
  }, [data, batchCountStr])

  const batchCountParsed =
    data != null
      ? Math.min(50, Math.max(1, parseInt(batchCountStr, 10) || 1), data.total)
      : 1

  const canAffordBatchEstimate = batchFifoEstimateCents === 0 || walletBalance >= batchFifoEstimateCents

  async function handleBatchClaim() {
    if (!data) return
    const n = Math.min(50, Math.max(1, parseInt(batchCountStr, 10) || 1), data.total)
    try {
      await claimMut.mutateAsync({
        count: n,
        idempotencyKey: `batch-${Date.now()}-${n}`,
        pipelineKind: 'PERSONAL',
      })
      setBatchConfirmOpen(false)
    } catch {
      /* surfaced below */
    }
  }

  async function handleSetPrice(leadId: number) {
    const raw = priceInputs[leadId] ?? ''
    const rupees = parseFloat(raw)
    if (isNaN(rupees) || rupees < 0) return
    const cents = Math.round(rupees * 100)
    try {
      await patchMut.mutateAsync({ id: leadId, body: { pool_price_cents: cents } })
      setPriceInputs((p) => ({ ...p, [leadId]: '' }))
    } catch {
      /* surfaced below */
    }
  }

  async function handleOutOfPool(leadId: number) {
    try {
      await patchMut.mutateAsync({ id: leadId, body: { in_pool: false } })
    } catch {
      /* surfaced below */
    }
  }

  async function handlePoolImport() {
    if (!poolFile) return
    setImportBusy(true)
    setImportNote(null)
    try {
      const fd = new FormData()
      fd.append('file', poolFile)
      const res = await apiFetch('/api/v1/lead-pool/import', { method: 'POST', body: fd })
      const body = (await res.json().catch(() => ({}))) as {
        created?: number
        warnings?: string[]
        error?: { message?: string }
      }
      if (!res.ok) {
        throw new Error(body.error?.message ?? res.statusText)
      }
      const w = body.warnings?.length ? ` ${body.warnings.join(' ')}` : ''
      setImportNote(`Imported ${body.created ?? 0} lead(s).${w}`)
      setPoolFile(null)
      await qc.invalidateQueries({ queryKey: ['lead-pool'] })
    } catch (e) {
      setImportNote(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setImportBusy(false)
    }
  }

  async function handleTestDelivery() {
    setTestBusy(true)
    setTestNote(null)
    try {
      const res = await apiFetch('/api/v1/system/test-delivery', { method: 'POST' })
      const body = (await res.json().catch(() => ({}))) as {
        realtime?: string
        email?: string
        web_push?: string
        error?: { message?: string }
      }
      if (!res.ok) {
        throw new Error(body.error?.message ?? res.statusText)
      }
      setTestNote(
        [body.realtime, body.email, body.web_push].filter(Boolean).join(' — ') ||
          'OK',
      )
    } catch (e) {
      setTestNote(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setTestBusy(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        <Link
          to="/dashboard/work/leads"
          className="text-sm text-primary underline-offset-2 hover:underline"
        >
          ← Calling Board
        </Link>
      </div>

      <p className="text-sm text-muted-foreground">
        Leads an admin has released into the shared pool. Claim individually, or up to 50 in one request
        (oldest in the pool first — same FIFO rules as the legacy app). Paid rows debit your wallet; the
        whole batch is rejected if the combined price exceeds your balance.
      </p>

      {role === 'admin' ? (
        <div className="surface-inset space-y-3 p-4 text-sm">
          <p className="font-medium text-foreground">Default claim price (new pool leads)</p>
          <p className="text-ds-caption text-muted-foreground">
            Set once here — it stays until you change it again. Every Excel import uses this price for new rows.
            You can still override individual leads below.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="lead-pool-default-price">
              Default price in rupees
            </label>
            <input
              id="lead-pool-default-price"
              type="number"
              min="0"
              step="1"
              placeholder="₹ per claim"
              value={defaultRupees}
              onChange={(e) => setDefaultRupees(e.target.value)}
              className="w-40 rounded-md border border-white/12 bg-white/[0.05] px-2 py-1.5 text-xs text-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35"
            />
            <Button
              type="button"
              size="sm"
              disabled={poolDefaultsMut.isPending || defaultRupees === ''}
              onClick={() => void handleSaveDefaultPoolPrice()}
            >
              {poolDefaultsMut.isPending ? 'Saving…' : 'Save default price'}
            </Button>
          </div>
          {poolDefaults != null ? (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              Saved:{' '}
              {poolDefaults.default_pool_price_cents === 0
                ? 'Free (₹0)'
                : formatRupees(poolDefaults.default_pool_price_cents)}
            </p>
          ) : null}
          {poolDefaultsMut.isError ? (
            <p className="text-xs text-destructive" role="alert">
              {poolDefaultsMut.error instanceof Error
                ? poolDefaultsMut.error.message
                : 'Could not save default price'}
            </p>
          ) : null}

          <p className="pt-2 font-medium text-foreground">Admin: import pool leads (Excel)</p>
          <p className="text-ds-caption text-muted-foreground">
            Use <strong className="font-medium text-foreground">.xlsx</strong> with a header row.
            Columns (flexible names): Submit Time, Full Name, Age, Gender, Phone Number (Calling
            Number), Your City Name, AD Name.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="lead-pool-import-file" className="sr-only">
              Choose Excel file to import into pool
            </label>
            <input
              id="lead-pool-import-file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="max-w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-primary file:px-2 file:py-1 file:text-xs file:font-medium file:text-primary-foreground"
              onChange={(e) => setPoolFile(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              size="sm"
              disabled={!poolFile || importBusy}
              onClick={() => void handlePoolImport()}
            >
              {importBusy ? 'Importing…' : 'Import to pool'}
            </Button>
          </div>
          {importNote ? (
            <p className="text-xs text-muted-foreground" role="status">
              {importNote}
            </p>
          ) : null}
          <div className="border-t border-border/80 pt-3">
            <p className="mb-2 font-medium text-foreground">Test realtime / delivery notes</p>
            <Button type="button" variant="outline" size="sm" disabled={testBusy} onClick={() => void handleTestDelivery()}>
              {testBusy ? 'Sending…' : 'Ping dashboards (WS) + show email/push status'}
            </Button>
            {testNote ? (
              <p className="mt-2 text-xs text-muted-foreground" role="status">
                {testNote}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Wallet balance chip */}
      {role !== 'admin' && walletData !== undefined ? (
        <div className="surface-inset inline-flex items-center gap-2 px-3 py-1.5 text-sm">
          <span className="text-muted-foreground">Wallet balance:</span>
          <span className={`font-semibold ${walletBalance > 0 ? 'text-[hsl(142_71%_48%)]' : 'text-destructive'}`}>
            {formatRupees(walletBalance)}
          </span>
          <Link to="/dashboard/finance/wallet" className="text-xs text-primary underline-offset-2 hover:underline">
            Top up →
          </Link>
        </div>
      ) : null}

      {isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}

      {isError ? (
        <div className="text-sm text-destructive" role="alert">
          <span>{error instanceof Error ? error.message : 'Could not load pool'} </span>
          <button type="button" className="underline underline-offset-2" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {data ? (
        <div className="surface-elevated p-4 text-sm text-muted-foreground">
          <p className="mb-3 font-medium text-foreground">In pool: {data.total}</p>

          {role !== 'admin' && data.total > 0 ? (
            <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs">
              <p className="font-medium text-foreground">Bulk claim (FIFO, max 50)</p>
              <p className="mt-1 text-muted-foreground">
                Server picks the oldest leads in the pool first. If this page does not list every pool row,
                the amount shown is only an estimate from visible leads.
              </p>
              {data.items.length < data.total ? (
                <p className="mt-2 text-amber-400/90">Some pool leads are not loaded on this screen.</p>
              ) : null}
              {batchConfirmOpen ? (
                <div className="mt-3 space-y-2 rounded-md border border-amber-400/30 bg-amber-400/5 p-2">
                  <p className="text-foreground">
                    Claim up to <strong className="tabular-nums">{batchCountParsed}</strong> lead(s)? Estimated
                    debit from visible FIFO slice:{' '}
                    <strong className="tabular-nums">{formatRupees(batchFifoEstimateCents)}</strong>
                    {' · '}
                    Balance: <strong className="tabular-nums">{formatRupees(walletBalance)}</strong>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={claimMut.isPending || !canAffordBatchEstimate}
                      onClick={() => void handleBatchClaim()}
                    >
                      {claimMut.isPending ? 'Claiming…' : 'Confirm batch'}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setBatchConfirmOpen(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <div>
                    <label htmlFor="lead-pool-batch-count" className="sr-only">
                      Number of leads to claim in one batch
                    </label>
                    <input
                      id="lead-pool-batch-count"
                      type="number"
                      min={1}
                      max={maxBatch}
                      step={1}
                      value={batchCountStr}
                      onChange={(e) => setBatchCountStr(e.target.value)}
                      className="w-20 rounded-md border border-white/12 bg-white/[0.05] px-2 py-1.5 text-xs text-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35"
                    />
                    <span className="ml-2 text-muted-foreground">(max {maxBatch})</span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!canAffordBatchEstimate || batchCountParsed < 1}
                    title={
                      !canAffordBatchEstimate
                        ? `Estimated ${formatRupees(batchFifoEstimateCents)} from visible rows; balance ${formatRupees(walletBalance)}`
                        : undefined
                    }
                    onClick={() => setBatchConfirmOpen(true)}
                  >
                    Claim batch
                  </Button>
                </div>
              )}
            </div>
          ) : null}

          {data.items.length === 0 ? (
            <p>No leads in pool right now.</p>
          ) : (
            <ul className="space-y-3">
              {(data.items as PoolLead[]).map((l) => {
                const price = l.pool_price_cents ?? 0
                const isFree = price === 0
                const canAfford = walletBalance >= price
                const isConfirming = confirmId === l.id

                return (
                  <li key={l.id} className="surface-inset flex flex-col gap-3 px-3 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground">{l.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          #{l.id} · {statusLabel(l.status)}
                          {l.city ? ` · ${l.city}` : ''}
                          {l.age != null ? ` · Age ${l.age}` : ''}
                          {l.gender ? ` · ${l.gender}` : ''}
                          {l.ad_name ? ` · AD: ${l.ad_name}` : ''}
                        </p>
                        {l.phone?.trim() ? (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="text-xs tabular-nums text-foreground">{l.phone}</span>
                            <LeadContactActions phone={l.phone} />
                          </div>
                        ) : null}
                      </div>

                      {/* Price badge */}
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        isFree
                          ? 'bg-[hsl(142_71%_45%)]/15 text-[hsl(142_71%_45%)]'
                          : 'bg-amber-400/15 text-amber-400'
                      }`}>
                        {isFree ? 'Free' : formatRupees(price)}
                      </span>
                    </div>

                    {/* Admin controls */}
                    {role === 'admin' ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          placeholder={`Override ₹ — row ${isFree ? 'free' : (price / 100).toFixed(0)} · saved default ₹${((poolDefaults?.default_pool_price_cents ?? 0) / 100).toFixed(0)}`}
                          value={priceInputs[l.id] ?? ''}
                          onChange={(e) => setPriceInputs((p) => ({ ...p, [l.id]: e.target.value }))}
                          className="w-40 rounded-md border border-white/12 bg-white/[0.05] px-2 py-1.5 text-xs text-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={patchMut.isPending || !priceInputs[l.id]}
                          onClick={() => void handleSetPrice(l.id)}
                        >
                          Set price
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={patchMut.isPending}
                          onClick={() => void handleOutOfPool(l.id)}
                        >
                          Remove from pool
                        </Button>
                      </div>
                    ) : null}

                    {/* Claim flow */}
                    {role !== 'admin' ? (
                      isConfirming ? (
                        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2">
                          <p className="flex-1 text-xs text-foreground">
                            {isFree
                              ? 'Claim this lead for free?'
                              : `Claim for ${formatRupees(price)}? Your balance: ${formatRupees(walletBalance)}`}
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            disabled={claimMut.isPending || (!isFree && !canAfford)}
                            onClick={() => void handleClaim(l.id)}
                          >
                            {claimMut.isPending ? 'Claiming…' : 'Confirm'}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          className="self-start"
                          disabled={!isFree && !canAfford}
                          title={!isFree && !canAfford ? `Need ${formatRupees(price)}, wallet has ${formatRupees(walletBalance)}` : undefined}
                          onClick={() => setConfirmId(l.id)}
                        >
                          {isFree ? 'Claim (free)' : `Claim for ${formatRupees(price)}`}
                        </Button>
                      )
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}

          {claimMut.isError ? (
            <p className="mt-3 text-xs text-destructive" role="alert">
              {claimMut.error instanceof Error ? claimMut.error.message : 'Claim failed'}
            </p>
          ) : null}
          {patchMut.isError ? (
            <p className="mt-2 text-xs text-destructive" role="alert">
              {patchMut.error instanceof Error ? patchMut.error.message : 'Update failed'}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
