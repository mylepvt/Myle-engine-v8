import { useState } from 'react'
import { Activity, Check, CheckCircle2, Copy, ContactRound, RefreshCw, Smartphone, XCircle } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { apiFetch } from '@/lib/api'
import { openContactCard } from '@/lib/contact-card'
import { messageFromApiErrorPayload } from '@/lib/http-error-message'

type SyncStatus = {
  enabled: boolean
  server: string
  /** Full account URL — paste into the iPhone "Server" field (no discovery needed). */
  server_url?: string
  username: string
  password?: string
}

async function call(path: string, method = 'GET'): Promise<SyncStatus> {
  const res = await apiFetch(path, { method })
  const raw: unknown = await res.json().catch(() => null)
  if (!res.ok) throw new Error(messageFromApiErrorPayload(raw, res.statusText) || `HTTP ${res.status}`)
  return raw as SyncStatus
}

const SYNC_KEY = ['admin', 'contacts', 'carddav'] as const

type Probe = { method: string; url: string; status: number | null; ok: boolean; detail?: string }
type Attempt = { at: string; method: string; path: string; status: number; auth: string; agent: string }
type Diagnostics = { server_url: string; self_check: Probe[] | null; attempts: Attempt[] }

async function fetchDiagnostics(check: boolean): Promise<Diagnostics> {
  const res = await apiFetch(`/api/v1/admin/contacts/carddav/diagnostics${check ? '?check=true' : ''}`)
  const raw: unknown = await res.json().catch(() => null)
  if (!res.ok) throw new Error(messageFromApiErrorPayload(raw, res.statusText) || `HTTP ${res.status}`)
  return raw as Diagnostics
}

function timeIst(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/** Shows whether the iPhone's requests reach the server, and self-tests the public HTTPS address. */
function ConnectionCheck() {
  const diag = useMutation({ mutationFn: (check: boolean) => fetchDiagnostics(check) })
  const d = diag.data
  return (
    <div className="space-y-2 border-t border-border/60 pt-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Activity className="size-4" aria-hidden /> Connection check
      </p>
      <p className="text-ds-caption text-muted-foreground">
        iPhone says “Cannot connect”? Tap check, then try adding the account on the iPhone and tap “Show iPhone
        attempts”.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={diag.isPending} onClick={() => diag.mutate(true)}>
          {diag.isPending ? 'Checking…' : 'Check connection'}
        </Button>
        <Button type="button" variant="outline" disabled={diag.isPending} onClick={() => diag.mutate(false)}>
          Show iPhone attempts
        </Button>
      </div>
      {diag.error ? <p className="text-ds-caption text-destructive">{diag.error.message}</p> : null}
      {d?.self_check ? (
        <ul className="space-y-1">
          {d.self_check.map((p) => (
            <li key={p.url + p.method} className="flex items-start gap-1.5 text-ds-caption">
              {p.ok ? (
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success-ink" aria-hidden />
              ) : (
                <XCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden />
              )}
              <span className="min-w-0 break-all">
                <b>{p.method}</b> {p.url} → {p.status ?? 'no response'}
                {p.detail ? <span className="text-muted-foreground"> · {p.detail}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {d ? (
        d.attempts.length ? (
          <div className="max-h-56 overflow-y-auto rounded-md border border-border/60">
            <table className="w-full text-left text-ds-micro">
              <tbody>
                {d.attempts.map((a, i) => (
                  <tr key={i} className="border-b border-border/40 last:border-0">
                    <td className="whitespace-nowrap px-2 py-1 text-muted-foreground">{timeIst(a.at)}</td>
                    <td className="px-2 py-1 font-mono">
                      {a.method} {a.path}
                    </td>
                    <td className={a.status < 400 ? 'px-2 py-1 text-success-ink' : 'px-2 py-1 text-destructive'}>
                      {a.status}
                    </td>
                    <td className="px-2 py-1 text-muted-foreground">
                      {a.auth}
                      {a.agent ? ` · ${a.agent}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-ds-caption text-warning-ink">
            No requests from the iPhone have reached the server yet.
          </p>
        )
      ) : null}
    </div>
  )
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5">
      <div className="min-w-0">
        <p className="text-ds-micro uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="truncate font-mono text-sm text-foreground">{value}</p>
      </div>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
          })
        }}
        className="shrink-0 rounded p-1.5 text-muted-foreground hover:text-foreground"
      >
        {copied ? <Check className="size-4 text-success-ink" /> : <Copy className="size-4" />}
      </button>
    </div>
  )
}

/** Admin: put every Day 2 prospect into the iPhone's contacts — once, or kept in sync. */
export function Day2ContactsCard() {
  const qc = useQueryClient()
  const status = useQuery({ queryKey: SYNC_KEY, queryFn: () => call('/api/v1/admin/contacts/carddav') })
  const [fresh, setFresh] = useState<SyncStatus | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const issue = useMutation({
    mutationFn: () => call('/api/v1/admin/contacts/carddav/password', 'POST'),
    onSuccess: (r) => {
      setFresh(r)
      void qc.invalidateQueries({ queryKey: SYNC_KEY })
    },
  })
  const turnOff = useMutation({
    mutationFn: () => call('/api/v1/admin/contacts/carddav', 'DELETE'),
    onSuccess: () => {
      setFresh(null)
      void qc.invalidateQueries({ queryKey: SYNC_KEY })
    },
  })

  const enabled = status.data?.enabled ?? false

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ContactRound className="size-4 text-primary" aria-hidden />
          Day 2 contacts → iPhone
        </CardTitle>
        <CardDescription>
          Every prospect who reached Day 2, saved as “Prospect – Leader – MYLE”. Admin only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Button
            type="button"
            className="w-full"
            disabled={saving}
            onClick={() => {
              setSaving(true)
              setSaveError(null)
              openContactCard('/api/v1/admin/contacts/day2.vcf')
                .catch((e: unknown) => setSaveError(e instanceof Error ? e.message : 'Could not open contacts'))
                .finally(() => setSaving(false))
            }}
          >
            <ContactRound className="size-4" aria-hidden />
            {saving ? 'Opening…' : 'Save all Day 2 contacts'}
          </Button>
          <p className="text-ds-caption text-muted-foreground">
            On iPhone tap “Add All Contacts”. Already-saved people are offered again, so prefer auto-sync below for
            regular use.
          </p>
          {saveError ? <p className="text-ds-caption text-destructive">{saveError}</p> : null}
        </div>

        <div className="space-y-2 border-t border-border/60 pt-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Smartphone className="size-4" aria-hidden /> Auto-sync to iPhone
            <span
              className={
                enabled
                  ? 'ml-auto rounded-full bg-success/15 px-2 py-0.5 text-ds-caption font-semibold text-success-ink'
                  : 'ml-auto rounded-full bg-muted px-2 py-0.5 text-ds-caption text-muted-foreground'
              }
            >
              {enabled ? 'On' : 'Off'}
            </span>
          </p>
          <p className="text-ds-caption text-muted-foreground">
            New Day 2 prospects appear in your iPhone contacts by themselves (as a separate “MYLE Day 2” list).
          </p>

          {fresh?.password ? (
            <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <ol className="list-decimal space-y-0.5 pl-4 text-ds-caption text-foreground">
                <li>
                  On your iPhone open <b>Settings → Apps → Contacts → Contacts Accounts</b>
                  <span className="text-muted-foreground"> (older iPhones: Settings → Contacts → Accounts)</span>
                </li>
                <li>
                  <b>Add Account → Other → Add CardDAV Account</b>
                </li>
                <li>Copy-paste the three values below</li>
              </ol>
              <CopyRow label="Server" value={fresh.server_url ?? fresh.server} />
              <CopyRow label="User Name" value={fresh.username} />
              <CopyRow label="Password" value={fresh.password} />
              <p className="text-ds-caption text-muted-foreground">
                Tap Next, then Save. This password is shown only once — it is not your MYLE login password.
              </p>
              <p className="text-ds-caption text-muted-foreground">
                Still “Cannot connect”? Open the account → Advanced Settings → turn <b>Use SSL</b> on and set{' '}
                <b>Port 443</b>.
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={enabled ? 'outline' : 'default'} disabled={issue.isPending} onClick={() => {
              if (enabled && !window.confirm('Create a new sync password? The old one stops working on your iPhone.')) return
              issue.mutate()
            }}>
              <RefreshCw className="size-4" aria-hidden />
              {enabled ? 'New sync password' : 'Set up auto-sync'}
            </Button>
            {enabled ? (
              <Button type="button" variant="outline" disabled={turnOff.isPending} onClick={() => {
                if (window.confirm('Turn off auto-sync? Your iPhone stops receiving new Day 2 contacts.')) turnOff.mutate()
              }}>
                Turn off
              </Button>
            ) : null}
          </div>
          {issue.error || turnOff.error ? (
            <p className="text-ds-caption text-destructive">{(issue.error ?? turnOff.error)?.message}</p>
          ) : null}
        </div>

        <ConnectionCheck />
      </CardContent>
    </Card>
  )
}
