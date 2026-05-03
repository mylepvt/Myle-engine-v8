import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  LEAD_STATUS_OPTIONS,
  useClaimLeadMutation,
  usePatchLeadMutation,
} from '@/hooks/use-leads-query'
import {
  useLeadPoolBatchClaimMutation,
  useLeadPoolBatchPreviewQuery,
  useLeadPoolDefaultsMutation,
  useLeadPoolDefaultsQuery,
  useLeadPoolQuery,
  type PoolLead,
} from '@/hooks/use-lead-pool-query'
import { LeadContactActions } from '@/components/leads/LeadContactActions'
import { useWalletMeQuery } from '@/hooks/use-wallet-query'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import { apiFetch } from '@/lib/api'
import { playAppSound } from '@/lib/app-sounds'

type Props = {
  title: string
}

function statusLabel(value: string): string {
  return LEAD_STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value
}

const rupeeFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatRupees(cents: number): string {
  return `₹${rupeeFormatter.format(cents / 100)}`
}

function formatRupeesInput(cents: number): string {
  const raw = (cents / 100).toFixed(2)
  return raw.endsWith('.00') ? raw.slice(0, -3) : raw
}

function parseRupeesToCents(value: string): number | null {
  const normalized = value.trim()
  if (!normalized) return null
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null
  const [wholePart, fractionPart = ''] = normalized.split('.')
  const whole = Number.parseInt(wholePart, 10)
  if (!Number.isFinite(whole) || whole < 0) return null
  const fraction = Number.parseInt((fractionPart + '00').slice(0, 2), 10)
  return whole * 100 + fraction
}

export function LeadPoolWorkPage({ title }: Props) {
  const qc = useQueryClient()
  const { role, serverRole, isAdminPreviewing } = useDashboardShellRole()
  const signedInRole = serverRole ?? role
  const canViewPoolList = signedInRole === 'admin'
  const { data, isPending, isError, error, refetch } = useLeadPoolQuery(canViewPoolList)
  const canManagePool = role === 'admin' && signedInRole === 'admin'
  const canClaimPool = signedInRole != null && ['team', 'leader', 'admin'].includes(signedInRole)
  const { data: poolDefaults } = useLeadPoolDefaultsQuery(canManagePool)
  const poolDefaultsMut = useLeadPoolDefaultsMutation()
  const { data: walletData } = useWalletMeQuery(canClaimPool)
  const claimMut = useClaimLeadMutation()
  const batchClaimMut = useLeadPoolBatchClaimMutation()
  const patchMut = usePatchLeadMutation()
  const claimBusy = claimMut.isPending || batchClaimMut.isPending
  const claimError = claimMut.error ?? batchClaimMut.error

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
  const requestedBatchCount = Math.min(50, Math.max(1, Number.parseInt(batchCountStr, 10) || 1))
  const {
    data: batchPreview,
    isPending: isBatchPreviewPending,
    isError: isBatchPreviewError,
    error: batchPreviewError,
    refetch: refetchBatchPreview,
  } = useLeadPoolBatchPreviewQuery(requestedBatchCount, canClaimPool)

  useEffect(() => {
    if (!poolDefaults || defaultPriceHydrated) return
    setDefaultRupees(formatRupeesInput(poolDefaults.default_pool_price_cents ?? 0))
    setDefaultPriceHydrated(true)
  }, [poolDefaults, defaultPriceHydrated])

  async function handleSaveDefaultPoolPrice() {
    const cents = parseRupeesToCents(defaultRupees)
    if (cents == null) return
    try {
      await poolDefaultsMut.mutateAsync({
        default_pool_price_cents: cents,
      })
    } catch {
      /* surfaced below */
    }
  }

  async function handleClaim(leadId: number) {
    try {
      await claimMut.mutateAsync(leadId)
      playAppSound('cashier')
      setConfirmId(null)
    } catch {
      /* error surfaced below */
    }
  }

  const maxBatch = Math.min(50, batchPreview?.available_count ?? 50)
  const batchCountParsed = batchPreview?.claim_count ?? 0
  const batchFifoEstimateCents = batchPreview?.total_price_cents ?? 0
  const canAffordBatchEstimate = batchFifoEstimateCents === 0 || walletBalance >= batchFifoEstimateCents

  async function handleBatchClaim() {
    try {
      await batchClaimMut.mutateAsync(requestedBatchCount)
      playAppSound('cashier')
      setBatchConfirmOpen(false)
    } catch {
      /* surfaced below */
    }
  }

  async function handleSetPrice(leadId: number) {
    const raw = priceInputs[leadId] ?? ''
    const cents = parseRupeesToCents(raw)
    if (cents == null) return
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
        {canViewPoolList
          ? 'Leads an admin has released into the shared pool. Admins can inspect the list, claim individually, or claim up to 50 in one request (oldest in the pool first — same FIFO rules as the legacy app). Paid rows debit your wallet; the whole batch is rejected if the combined price exceeds your balance.'
          : 'Leads an admin has released into the shared pool. Leaders and team members can only claim in bulk here, with the server always taking the oldest available leads first. Paid rows debit your wallet, and the whole batch is rejected if the combined price exceeds your balance.'}
      </p>

      {isAdminPreviewing ? (
        <div className="surface-inset border border-primary/20 px-4 py-3 text-xs text-muted-foreground">
          View-as only changes the navigation. Claim, pricing, and import actions still use your signed-in
          admin account.
        </div>
      ) : null}

      {canManagePool ? (
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
              step="0.01"
              placeholder="₹ per claim"
              value={defaultRupees}
              onChange={(e) => setDefaultRupees(e.target.value)}
              className="w-40 rounded-md border border-white/12 bg-muted/50 px-2 py-1.5 text-xs text-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35"
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
      {canClaimPool && walletData !== undefined ? (
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

      {canViewPoolList && isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}

      {canViewPoolList && isError ? (
        <div className="text-sm text-destructive" role="alert">
          <span>{error instanceof Error ? error.message : 'Could not load pool'} </span>
          <button type="button" className="underline underline-offset-2" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {canClaimPool ? (
        <div className="surface-elevated p-4 text-sm text-muted-foreground">
          <p className="mb-3 font-medium text-foreground">
            In pool: {batchPreview?.available_count ?? (canViewPoolList ? data?.total ?? 0 : 0)}
          </p>

          {isBatchPreviewPending ? (
            <div className="space-y-2">
              <Skeleton className="h-24 w-full" />
            </div>
          ) : null}

          {isBatchPreviewError ? (
            <div className="mb-4 text-xs text-destructive" role="alert">
              <span>{batchPreviewError instanceof Error ? batchPreviewError.message : 'Could not load bulk claim preview'} </span>
              <button type="button" className="underline underline-offset-2" onClick={() => void refetchBatchPreview()}>
                Retry
              </button>
            </div>
          ) : null}

          {batchPreview != null ? (
            <div className="mb-4 rounded-lg border border-white/10 bg-muted/30 p-3 text-xs">
              <p className="font-medium text-foreground">Bulk claim (FIFO, max 50)</p>
              <p className="mt-1 text-muted-foreground">
                Server picks the oldest leads in the pool first and returns the exact combined price for this request.
                Leaders and team members can only claim in bulk from this screen.
              </p>
              {batchConfirmOpen ? (
                <div className="mt-3 space-y-2 rounded-md border border-amber-400/30 bg-amber-400/5 p-2">
                  <p className="text-foreground">
                    Claim up to <strong className="tabular-nums">{batchCountParsed}</strong> lead(s)? Exact
                    debit for the current FIFO slice:{' '}
                    <strong className="tabular-nums">{formatRupees(batchFifoEstimateCents)}</strong>
                    {' · '}
                    Balance: <strong className="tabular-nums">{formatRupees(walletBalance)}</strong>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={claimBusy || !canAffordBatchEstimate || batchCountParsed < 1}
                      onClick={() => void handleBatchClaim()}
                    >
                      {claimBusy ? 'Claiming…' : 'Confirm batch'}
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
                      max={Math.max(1, maxBatch)}
                      step={1}
                      value={batchCountStr}
                      onChange={(e) => setBatchCountStr(e.target.value)}
                      className="w-20 rounded-md border border-white/12 bg-muted/50 px-2 py-1.5 text-xs text-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35"
                    />
                    <span className="ml-2 text-muted-foreground">(max {maxBatch})</span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={claimBusy || !canAffordBatchEstimate || batchCountParsed < 1}
                    title={
                      !canAffordBatchEstimate
                        ? `Need ${formatRupees(batchFifoEstimateCents)}; wallet has ${formatRupees(walletBalance)}`
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

          {canViewPoolList && data != null && data.items.length === 0 ? (
            <p>No leads in pool right now.</p>
          ) : null}

          {!canViewPoolList && batchPreview != null && batchPreview.available_count === 0 ? (
            <p>No leads in pool right now.</p>
          ) : null}

          {!canViewPoolList ? (
            <p className="text-xs text-muted-foreground">
              Lead details and single-claim actions are admin-only. Use bulk claim to pull the oldest available
              leads.
            </p>
          ) : null}

          {canViewPoolList && data != null && data.items.length > 0 ? (
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
                    {canManagePool ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder={`Override ₹ — row ${isFree ? 'free' : formatRupeesInput(price)} · saved default ₹${formatRupeesInput(poolDefaults?.default_pool_price_cents ?? 0)}`}
                          value={priceInputs[l.id] ?? ''}
                          onChange={(e) => setPriceInputs((p) => ({ ...p, [l.id]: e.target.value }))}
                          className="w-40 rounded-md border border-white/12 bg-muted/50 px-2 py-1.5 text-xs text-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35"
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
                    {canClaimPool ? (
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
                            disabled={claimBusy || (!isFree && !canAfford)}
                            onClick={() => void handleClaim(l.id)}
                          >
                            {claimBusy ? 'Claiming…' : 'Confirm'}
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
                          disabled={claimBusy || (!isFree && !canAfford)}
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
          ) : null}

          {claimMut.isError || batchClaimMut.isError ? (
            <p className="mt-3 text-xs text-destructive" role="alert">
              {claimError instanceof Error
                ? claimError.message
                : 'Claim failed'}
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
