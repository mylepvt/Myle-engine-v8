import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BellOff, BellRing, Globe, Smartphone } from 'lucide-react'

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

type AppSetup = { total: number; ready: number; installed: number; notifications_on: number; members: SetupMember[] }

const APP_LABEL: Record<SetupMember['app'], string> = {
  installed: 'App installed',
  browser: 'Using browser',
  unknown: 'Not opened yet',
}
const NOTIF_LABEL: Record<SetupMember['notifications'], string> = {
  on: 'Notifications on',
  blocked: 'Notifications blocked',
  off: 'Notifications off',
}
const COLLAPSED = 6

function Pill({ ok, icon: Icon, children }: { ok: boolean; icon: typeof Smartphone; children: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-ds-micro font-semibold',
        ok ? 'border-success/30 bg-success/10 text-success-ink' : 'border-destructive/30 bg-destructive/10 text-destructive-ink',
      )}
    >
      <Icon className="size-3" aria-hidden />
      {children}
    </span>
  )
}

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
  const shown = expanded ? data?.members ?? [] : notReady.slice(0, COLLAPSED)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-ds-h3">
          <Smartphone className="size-4 text-primary" aria-hidden />
          App &amp; notifications
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : isError || !data ? (
          <p className="text-ds-caption text-muted-foreground">Setup status is unavailable right now.</p>
        ) : (
          <>
            <p className="text-sm text-foreground">
              <span className="font-semibold">{data.ready}</span> of {data.total} ready ·{' '}
              {data.installed} installed · {data.notifications_on} notifications on
            </p>
            {!notReady.length && !expanded ? (
              <p className="text-ds-caption text-success-ink">Everyone has the app installed with notifications on.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {shown.map((m) => (
                  <li key={m.user_id} className="space-y-1 py-2">
                    <p className="truncate text-sm font-medium text-foreground">
                      {m.name}
                      {m.role === 'leader' ? <span className="ml-1 text-ds-caption text-muted-foreground">(leader)</span> : null}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <Pill ok={m.app === 'installed'} icon={m.app === 'browser' ? Globe : Smartphone}>
                        {APP_LABEL[m.app] + (m.platform && m.app !== 'unknown' ? ` · ${m.platform === 'ios' ? 'iPhone' : m.platform === 'android' ? 'Android' : 'Computer'}` : '')}
                      </Pill>
                      <Pill ok={m.notifications === 'on'} icon={m.notifications === 'on' ? BellRing : BellOff}>
                        {NOTIF_LABEL[m.notifications]}
                      </Pill>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {data.members.length > shown.length || expanded ? (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="w-full text-center text-ds-caption font-semibold text-primary hover:underline"
              >
                {expanded ? 'Show only not ready' : `Show everyone (${data.total})`}
              </button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
