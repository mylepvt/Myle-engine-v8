import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Banknote,
  Bell,
  ClipboardCheck,
  Megaphone,
  PauseCircle,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'

import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useFlpMinBillingApprovalsPendingQuery, useTeamMembersQuery } from '@/hooks/use-team-query'
import { useWalletRechargeRequestsQuery } from '@/hooks/use-wallet-recharge-query'
import { useNoticeBoardUnread } from '@/hooks/use-notice-board-unread'

type PendingRegistrationResponse = { total: number }

type NotifyRow = {
  key: string
  label: string
  count: number
  to: string
  Icon: LucideIcon
  accent: string
}

/** Admin pending-requests bell — aggregates every pending action into one dropdown. */
export function NotificationsBell() {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 56, right: 12 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const registrations = useQuery({
    queryKey: ['team', 'pending-registrations', 'bell'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/team/pending-registrations')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as PendingRegistrationResponse
    },
    refetchInterval: 30_000,
  })
  const flpApprovals = useFlpMinBillingApprovalsPendingQuery()
  const recharge = useWalletRechargeRequestsQuery()
  const members = useTeamMembersQuery()
  const { unread: noticeUnread } = useNoticeBoardUnread()

  const rechargePending = (recharge.data?.items ?? []).filter((i) => i.status === 'pending').length
  const gracePending = (members.data?.items ?? []).filter((m) => m.grace_request_end_date != null).length

  const rows: NotifyRow[] = [
    {
      key: 'registrations',
      label: 'New registrations',
      count: registrations.data?.total ?? 0,
      to: '/dashboard/team/members',
      Icon: UserPlus,
      accent: 'text-amber-600 dark:text-amber-400',
    },
    {
      key: 'flp',
      label: 'FLP approvals',
      count: flpApprovals.data?.total ?? 0,
      to: '/dashboard/team/flp-min-billing',
      Icon: ClipboardCheck,
      accent: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      key: 'recharge',
      label: 'Recharge requests',
      count: rechargePending,
      to: '/dashboard/finance/recharge-admin',
      Icon: Banknote,
      accent: 'text-blue-600 dark:text-blue-400',
    },
    {
      key: 'grace',
      label: 'Grace requests',
      count: gracePending,
      to: '/dashboard/team/members?grace=1',
      Icon: PauseCircle,
      accent: 'text-violet-600 dark:text-violet-400',
    },
  ]

  const pendingTotal = rows.reduce((a, r) => a + r.count, 0)
  const badge = pendingTotal + noticeUnread

  // Anchor the portal panel just under the bell, top-right aligned.
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect()
      if (r) setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={badge > 0 ? `Notifications — ${badge} pending` : 'Notifications'}
        onClick={() => setOpen((o) => !o)}
        className="relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-muted-foreground transition-colors duration-100 hover:bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] hover:text-foreground"
      >
        <Bell className="size-[17px]" />
        {badge > 0 ? (
          <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex min-w-[16px] items-center justify-center rounded bg-destructive px-1 text-[10px] font-bold leading-4 text-white">
            {badge > 9 ? '9+' : badge}
          </span>
        ) : null}
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          role="menu"
          style={{ position: 'fixed', top: pos.top, right: pos.right, maxHeight: 'calc(100vh - 72px)' }}
          className="z-[60] flex w-72 max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-2xl border border-border/60 bg-popover/95 shadow-xl backdrop-blur-xl"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border/40 px-4 py-2.5">
            <span className="text-sm font-semibold text-foreground">Notifications</span>
            <span className="text-[11px] text-muted-foreground">
              {pendingTotal > 0 ? `${pendingTotal} pending` : 'All clear'}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {rows.map((r) => {
              const Icon = r.Icon
              const has = r.count > 0
              return (
                <Link
                  key={r.key}
                  to={r.to}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition',
                    has ? 'hover:bg-muted/60' : 'opacity-50 hover:bg-muted/40',
                  )}
                >
                  <Icon className={cn('size-4 shrink-0', has ? r.accent : 'text-muted-foreground')} />
                  <span className="flex-1 text-left text-foreground/90">{r.label}</span>
                  {has ? (
                    <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-bold text-destructive">
                      {r.count}
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground/60">0</span>
                  )}
                </Link>
              )
            })}
          </div>

          <Link
            to="/dashboard/other/notice-board"
            onClick={() => setOpen(false)}
            className="flex shrink-0 items-center gap-3 border-t border-border/40 px-4 py-2.5 text-sm text-foreground/90 transition hover:bg-muted/60"
          >
            <Megaphone className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 text-left">Notice board</span>
            {noticeUnread > 0 ? (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">
                {noticeUnread}
              </span>
            ) : null}
          </Link>
        </div>,
        document.body,
      )}
    </div>
  )
}
