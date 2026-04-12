import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  LEAD_STATUS_OPTIONS,
  useClaimLeadMutation,
  usePatchLeadMutation,
} from '@/hooks/use-leads-query'
import { useLeadPoolQuery, type PoolLead } from '@/hooks/use-lead-pool-query'
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
  const { data: walletData } = useWalletMeQuery(true)
  const claimMut = useClaimLeadMutation()
  const patchMut = usePatchLeadMutation()

  // Confirm dialog state: which lead is being claimed
  const [confirmId, setConfirmId] = useState<number | null>(null)
  // Admin: price input per lead
  const [priceInputs, setPriceInputs] = useState<Record<number, string>>({})
  const [poolFile, setPoolFile] = useState<File | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  const [importNote, setImportNote] = useState<string | null>(null)
  const [testBusy, setTestBusy] = useState(false)
  const [testNote, setTestNote] = useState<string | null>(null)

  const walletBalance = walletData?.balance_cents ?? 0

  async function handleClaim(leadId: number) {
    try {
      await claimMut.mutateAsync(leadId)
      setConfirmId(null)
    } catch {
      /* error surfaced below */
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
          ← My leads
        </Link>
      </div>

      <p className="text-sm text-muted-foreground">
        Leads an admin has released into the shared pool. Claim one to assign it to yourself —
        paid leads will be debited from your wallet.
      </p>

      {role === 'admin' ? (
        <div className="surface-inset space-y-3 p-4 text-sm">
          <p className="font-medium text-foreground">Admin: import pool leads (Excel)</p>
          <p className="text-ds-caption text-muted-foreground">
            Use <strong className="font-medium text-foreground">.xlsx</strong> with a header row.
            Columns (flexible names): Submit Time, Full Name, Age, Gender, Phone Number (Calling
            Number), Your City Name, AD Name.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
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
                          {l.phone ? ` · ${l.phone}` : ''}
                          {l.city ? ` · ${l.city}` : ''}
                          {l.age != null ? ` · Age ${l.age}` : ''}
                          {l.gender ? ` · ${l.gender}` : ''}
                          {l.ad_name ? ` · AD: ${l.ad_name}` : ''}
                        </p>
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
                          placeholder={`Price ₹ (current: ${isFree ? 'free' : (price / 100).toFixed(0)})`}
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
