import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Smartphone } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

type SetupMember = {
  user_id: number
  name: string
  role: string
  app: 'installed' | 'browser' | 'unknown'
  platform: 'ios' | 'android' | 'desktop' | null
  notifications: 'on' | 'blocked' | 'off'
  ready: boolean
}

type PushRun = {
  job: string
  label: string
  scheduled: string
  ran: boolean
  runs: number
  targeted: number
  sent: number
  error: string | null
}

/** One line per scheduled notification: did it run today, and how many did it reach? */
function PushRunsToday() {
  const { data } = useQuery<{ jobs: PushRun[] }>({
    queryKey: ['admin', 'push-runs'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/admin/push-runs')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    staleTime: 60_000,
  })
  const [open, setOpen] = useState(false)
  if (!data) return null
  const ran = data.jobs.filter((j) => j.ran).length
  const failed = data.jobs.filter((j) => j.error).length
  return (
    <div className="rounded-xl border border-border/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center gap-3 px-3 text-left"
      >
        <span className="min-w-0 flex-1 truncate text-ds-body font-medium text-foreground">Auto notifications</span>
        <span className={cn('shrink-0 text-ds-caption tabular-nums', failed ? 'text-destructive-ink' : 'text-muted-foreground')}>
          {failed ? `${failed} failed` : `${ran}/${data.jobs.length} ran today`}
        </span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open ? (
        <div className="space-y-2 border-t border-border/60 px-3 py-3">
          <ul className="space-y-1.5">
            {data.jobs.map((j) => {
              const status = j.error
                ? { text: 'Failed', cls: 'text-destructive-ink' }
                : !j.ran
                  ? { text: 'Not run yet', cls: 'text-muted-foreground' }
                  : j.targeted === 0
                    ? { text: 'Nobody needed it', cls: 'text-muted-foreground' }
                    : {
                        text: `${j.sent} of ${j.targeted} reached`,
                        cls: j.sent >= j.targeted ? 'text-success-ink' : 'text-warning-ink',
                      }
              return (
                <li key={j.job} className="flex items-baseline justify-between gap-3 text-ds-caption">
                  <span className="min-w-0 truncate text-foreground">
                    {j.label} <span className="text-muted-foreground">· {j.scheduled}</span>
                  </span>
                  <span className={cn('shrink-0 font-medium tabular-nums', status.cls)}>{status.text}</span>
                </li>
              )
            })}
          </ul>
          <p className="text-ds-micro text-muted-foreground">
            "Reached" = delivered to at least one phone. People with notifications off are not reached.
          </p>
        </div>
      ) : null}
    </div>
  )
}

type AppSetup = { total: number; ready: number; installed: number; notifications_on: number; members: SetupMember[] }

const APP_LABEL: Record<SetupMember['app'], string> = {
  installed: 'App installed',
  browser: 'Using browser',
  unknown: 'Not opened yet',
}
const NOTIF_LABEL: Record<SetupMember['notifications'], string> = {
  on: 'notifications on',
  blocked: 'notifications blocked',
  off: 'notifications off',
}
const PLATFORM: Record<NonNullable<SetupMember['platform']>, string> = { ios: 'iPhone', android: 'Android', desktop: 'Computer' }

/** Admin: who has Myle installed on their phone and notifications on — not-ready people first. */
export function AppSetupCard() {
  const [expanded, setExpanded] = useState(false)
  const { data, isPending, isError } = useQuery<AppSetup>({
    queryKey: ['admin', 'app-setup'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/admin/app-setup')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    staleTime: 60_000,
  })
  const notReady = data?.members.filter((m) => !m.ready) ?? []
  const shown = expanded ? [...notReady, ...(data?.members.filter((m) => m.ready) ?? [])] : []

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-ds-h3">
          <Smartphone className="size-4 text-primary" aria-hidden />
          App &amp; notifications
          {data ? (
            <span className="ml-auto text-ds-caption font-medium tabular-nums text-muted-foreground">
              {data.ready}/{data.total} ready
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : isError || !data ? (
          <p className="text-ds-caption text-muted-foreground">Setup status is unavailable right now.</p>
        ) : (
          <>
            <div className="space-y-2">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                <div
                  className="h-full rounded-full bg-success"
                  style={{ width: `${data.total ? Math.round((data.ready / data.total) * 100) : 0}%` }}
                />
              </div>
              <p className="text-ds-caption text-muted-foreground">
                {data.installed} installed · {data.notifications_on} notifications on
                {notReady.length ? ` · ${notReady.length} not ready` : ''}
              </p>
            </div>
            <PushRunsToday />
            {!notReady.length ? (
              <p className="text-ds-caption text-success-ink">Everyone has the app installed with notifications on.</p>
            ) : null}
            {shown.length ? (
              <ul className="divide-y divide-border/60">
                {shown.map((m) => (
                  <li key={m.user_id} className="flex min-h-14 items-center gap-3 py-2">
                    <span
                      className={cn('size-2 shrink-0 rounded-full', m.ready ? 'bg-success' : 'bg-destructive')}
                      aria-label={m.ready ? 'Ready' : 'Not ready'}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-ds-body font-medium text-foreground">
                        {m.name}
                        {m.role === 'leader' ? (
                          <span className="ml-1.5 text-ds-caption font-normal text-muted-foreground">Leader</span>
                        ) : null}
                      </p>
                      <p className="truncate text-ds-caption font-normal text-muted-foreground">
                        {APP_LABEL[m.app]}
                        {m.platform && m.app !== 'unknown' ? ` (${PLATFORM[m.platform]})` : ''} · {NOTIF_LABEL[m.notifications]}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            {data.members.length ? (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="h-9 w-full rounded-lg text-ds-caption font-semibold text-primary hover:bg-primary/5"
              >
                {expanded
                  ? 'Hide people'
                  : notReady.length
                    ? `Show who (${notReady.length} not ready)`
                    : `Show everyone (${data.total})`}
              </button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
