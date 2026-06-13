import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  CheckCheck,
  ClipboardList,
  Megaphone,
  ShieldAlert,
  Trophy,
  UserPlus,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import {
  useNotificationsFeedQuery,
  useNotificationsMutations,
  useNotificationsUnreadQuery,
  type NotificationItem,
} from '@/hooks/use-notifications-feed-query'
import { cn } from '@/lib/utils'

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Date.now() - then
  const sec = Math.round(diff / 1000)
  if (sec < 45) return 'just now'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day}d`
  const wk = Math.round(day / 7)
  if (wk < 5) return `${wk}w`
  return new Date(iso).toLocaleDateString()
}

const CATEGORY_ICON: Record<string, LucideIcon> = {
  wallet: Wallet,
  compliance: ShieldAlert,
  lead: UserPlus,
  leads: UserPlus,
  report: ClipboardList,
  reports: ClipboardList,
  xp: Trophy,
  announcement: Megaphone,
}

function iconFor(category: string): LucideIcon {
  return CATEGORY_ICON[category?.toLowerCase()] ?? Bell
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const unreadQuery = useNotificationsUnreadQuery()
  const feedQuery = useNotificationsFeedQuery(open)
  const { markOne, markAll } = useNotificationsMutations()

  const unread = unreadQuery.data ?? 0
  const items = feedQuery.data?.items ?? []

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function handleItemClick(item: NotificationItem) {
    if (!item.read) markOne.mutate(item.id)
    setOpen(false)
    if (item.url) {
      if (/^https?:\/\//i.test(item.url)) {
        window.location.assign(item.url)
      } else {
        navigate(item.url)
      }
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-muted-foreground transition-colors duration-100 hover:bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] hover:text-foreground"
        aria-label={unread > 0 ? `Notifications — ${unread} unread` : 'Notifications'}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Bell className="size-[17px]" />
        {unread > 0 ? (
          <span
            className="pointer-events-none absolute -right-0.5 -top-0.5 flex min-w-[16px] items-center justify-center rounded bg-destructive px-1 text-[10px] font-bold leading-4 text-white"
            aria-hidden
          >
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          className={cn(
            'absolute right-0 top-[calc(100%+6px)] z-50 w-[min(360px,calc(100vw-24px))]',
            'overflow-hidden rounded-xl border border-border bg-popover shadow-lg',
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-sm font-semibold text-foreground">Notifications</p>
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
                className="flex items-center gap-1 text-xs font-medium text-primary transition hover:underline disabled:opacity-60"
              >
                <CheckCheck className="size-3.5" />
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="max-h-[min(70vh,420px)] overflow-y-auto overscroll-contain">
            {feedQuery.isLoading ? (
              <div className="space-y-3 p-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex gap-3">
                    <div className="size-9 shrink-0 animate-pulse rounded-full bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                    </div>
                  </div>
                ))}
              </div>
            ) : feedQuery.isError ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                Could not load notifications.
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <Bell className="size-7 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">You&apos;re all caught up.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((item) => {
                  const Icon = iconFor(item.category)
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleItemClick(item)}
                        className={cn(
                          'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
                          'hover:bg-[color-mix(in_srgb,var(--foreground)_5%,transparent)]',
                          !item.read && 'bg-primary/5',
                        )}
                      >
                        <span
                          className={cn(
                            'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full',
                            item.read
                              ? 'bg-muted text-muted-foreground'
                              : 'bg-primary/15 text-primary',
                          )}
                        >
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-foreground">
                              {item.title}
                            </span>
                            {!item.read ? (
                              <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden />
                            ) : null}
                          </span>
                          {item.body ? (
                            <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                              {item.body}
                            </span>
                          ) : null}
                          <span className="mt-1 block text-[11px] text-muted-foreground/80">
                            {relativeTime(item.created_at)}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
