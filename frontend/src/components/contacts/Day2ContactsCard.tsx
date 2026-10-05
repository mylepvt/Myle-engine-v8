import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, ContactRound, RefreshCw, Unplug, UserPlus } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { apiFetch } from '@/lib/api'
import { openContactCard } from '@/lib/contact-card'
import { messageFromApiErrorPayload } from '@/lib/http-error-message'
import { formatRelativeTimeShort } from '@/lib/utils'

type GoogleStatus = {
  configured: boolean
  connected: boolean
  email: string | null
  last_sync: string | null
  last_count: number
  last_error: string | null
  redirect_uri?: string
}

async function call<T>(path: string, method = 'GET'): Promise<T> {
  const res = await apiFetch(path, { method })
  const raw: unknown = await res.json().catch(() => null)
  if (!res.ok) throw new Error(messageFromApiErrorPayload(raw, res.statusText) || `HTTP ${res.status}`)
  return raw as T
}

const GOOGLE_KEY = ['admin', 'contacts', 'google'] as const
const NEW_KEY = ['admin', 'contacts', 'day2-new'] as const

const RETURN_MESSAGES: Record<string, { text: string; ok: boolean }> = {
  connected: { text: 'Google connected — Day 2 contacts are syncing.', ok: true },
  cancelled: { text: 'Google connection was cancelled.', ok: false },
  error: { text: 'Google connected, but the first sync failed — see the error below and tap Sync now.', ok: false },
}

/** Optional: keep Day 2 prospects in the admin's Google Contacts (synced to the iPhone). */
function GoogleSyncSection() {
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [returned, setReturned] = useState<string | null>(null)
  const status = useQuery({ queryKey: GOOGLE_KEY, queryFn: () => call<GoogleStatus>('/api/v1/admin/contacts/google') })

  // Back from Google's consent screen: /dashboard?google_contacts=connected|cancelled|error
  useEffect(() => {
    const flag = params.get('google_contacts')
    if (!flag) return
    setReturned(flag)
    const next = new URLSearchParams(params)
    next.delete('google_contacts')
    setParams(next, { replace: true })
    void qc.invalidateQueries({ queryKey: GOOGLE_KEY })
  }, [params, setParams, qc])

  const connect = useMutation({
    mutationFn: () => call<{ url: string }>('/api/v1/admin/contacts/google/connect'),
    onSuccess: ({ url }) => window.location.assign(url),
  })
  const syncNow = useMutation({
    mutationFn: () => call<GoogleStatus & { created: number; updated: number }>('/api/v1/admin/contacts/google/sync', 'POST'),
    onSettled: () => void qc.invalidateQueries({ queryKey: GOOGLE_KEY }),
  })
  const disconnect = useMutation({
    mutationFn: () => call<GoogleStatus>('/api/v1/admin/contacts/google', 'DELETE'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: GOOGLE_KEY }),
  })

  const g = status.data
  const notice = returned ? RETURN_MESSAGES[returned] : null
  const actionError = connect.error ?? syncNow.error ?? disconnect.error

  return (
    <details className="group border-t border-border/60 pt-3" open={Boolean(g?.connected) || Boolean(notice)}>
      <summary className="cursor-pointer text-sm font-semibold text-muted-foreground">
        Auto-sync with Google (optional)
      </summary>
      <div className="mt-2">
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            Auto-sync with Google Contacts
            <span
              className={
                g?.connected
                  ? 'ml-auto rounded-full bg-success/15 px-2 py-0.5 text-ds-caption font-semibold text-success-ink'
                  : 'ml-auto rounded-full bg-muted px-2 py-0.5 text-ds-caption text-muted-foreground'
              }
            >
              {g?.connected ? 'On' : 'Off'}
            </span>
          </p>
          {notice ? (
            <p className={notice.ok ? 'text-ds-caption text-success-ink' : 'text-ds-caption text-warning-ink'}>{notice.text}</p>
          ) : null}

          {g && !g.configured ? (
            <p className="text-ds-caption text-warning-ink">
              Not set up on the server yet: add GOOGLE_CONTACTS_CLIENT_ID and GOOGLE_CONTACTS_CLIENT_SECRET in Render.
              {g.redirect_uri ? (
                <>
                  {' '}Authorised redirect URI: <span className="break-all font-mono">{g.redirect_uri}</span>
                </>
              ) : null}
            </p>
          ) : null}

          {g?.connected ? (
            <div className="space-y-1 rounded-lg border border-success/30 bg-success/5 p-3 text-ds-caption">
              <p className="flex items-center gap-1.5 font-semibold text-foreground">
                <CheckCircle2 className="size-3.5 text-success-ink" aria-hidden />
                {g.email ?? 'Google account'}
              </p>
              <p className="text-muted-foreground">
                {g.last_count} contacts in the “MYLE Day 2” label
                {g.last_sync ? ` · synced ${formatRelativeTimeShort(g.last_sync)}` : ''} · updates every 15 min
              </p>
              {g.last_error ? <p className="text-destructive">{g.last_error}</p> : null}
              <p className="text-muted-foreground">
                On iPhone: Settings → Apps → Contacts → Contacts Accounts → Gmail → turn <b>Contacts</b> on.
              </p>
            </div>
          ) : (
            <p className="text-ds-caption text-muted-foreground">
              Connect the Google account that is on your iPhone. New Day 2 prospects then appear in your iPhone
              contacts by themselves.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {g?.connected ? (
              <>
                <Button type="button" disabled={syncNow.isPending} onClick={() => syncNow.mutate()}>
                  <RefreshCw className={syncNow.isPending ? 'size-4 animate-spin' : 'size-4'} aria-hidden />
                  {syncNow.isPending ? 'Syncing…' : 'Sync now'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={disconnect.isPending}
                  onClick={() => {
                    if (window.confirm('Stop syncing to Google? Contacts already in Google stay there.')) disconnect.mutate()
                  }}
                >
                  <Unplug className="size-4" aria-hidden />
                  Disconnect
                </Button>
              </>
            ) : (
              <Button type="button" disabled={connect.isPending || (g ? !g.configured : true)} onClick={() => connect.mutate()}>
                {connect.isPending ? 'Opening Google…' : 'Connect Google'}
              </Button>
            )}
          </div>
          {syncNow.data ? (
            <p className="text-ds-caption text-success-ink">
              Synced: {syncNow.data.created} added, {syncNow.data.updated} updated.
            </p>
          ) : null}
          {actionError ? <p className="text-ds-caption text-destructive">{actionError.message}</p> : null}
        </div>
      </div>
    </details>
  )
}

/** Admin: put Day 2 prospects into the iPhone's contacts — only the new ones, or everyone. */
export function Day2ContactsCard() {
  const qc = useQueryClient()
  const newCount = useQuery({
    queryKey: NEW_KEY,
    queryFn: () => call<{ new: number }>('/api/v1/admin/contacts/day2/new-count'),
  })
  const [message, setMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState<'new' | 'all' | null>(null)

  const run = (kind: 'new' | 'all') => {
    setSaving(kind)
    setSaveError(null)
    setMessage(null)
    const go = async () => {
      if (kind === 'all') return openContactCard('/api/v1/admin/contacts/day2.vcf')
      const made = await call<{ count: number; path: string | null }>('/api/v1/admin/contacts/day2/new-export', 'POST')
      if (!made.path) {
        setMessage('No new Day 2 contacts — everyone is already saved.')
        return
      }
      setMessage(`${made.count} new contact${made.count === 1 ? '' : 's'} — on iPhone tap “Add All Contacts”.`)
      await openContactCard(made.path)
    }
    go()
      .catch((e: unknown) => setSaveError(e instanceof Error ? e.message : 'Could not open contacts'))
      .finally(() => {
        setSaving(null)
        void qc.invalidateQueries({ queryKey: NEW_KEY })
      })
  }

  const pending = newCount.data?.new

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
        <div className="space-y-2">
          <Button type="button" className="w-full" disabled={saving !== null || pending === 0} onClick={() => run('new')}>
            <UserPlus className="size-4" aria-hidden />
            {saving === 'new'
              ? 'Opening…'
              : pending === 0
                ? 'All Day 2 contacts saved'
                : `Save new Day 2 contacts${pending != null ? ` (${pending})` : ''}`}
          </Button>
          <p className="text-ds-caption text-muted-foreground">
            Only people you haven’t saved yet — no duplicates. On iPhone tap “Add All Contacts”.
          </p>
          <Button type="button" variant="outline" className="w-full" disabled={saving !== null} onClick={() => run('all')}>
            <ContactRound className="size-4" aria-hidden />
            {saving === 'all' ? 'Opening…' : 'Save all Day 2 contacts'}
          </Button>
          {message ? <p className="text-ds-caption text-success-ink">{message}</p> : null}
          {saveError ? <p className="text-ds-caption text-destructive">{saveError}</p> : null}
        </div>

        <GoogleSyncSection />
      </CardContent>
    </Card>
  )
}
