import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'

export type NotificationItem = {
  id: number
  title: string
  body: string
  url: string
  category: string
  read: boolean
  created_at: string
}

export type NotificationFeed = {
  items: NotificationItem[]
  unread: number
  total: number
}

async function readError(res: Response): Promise<string> {
  const err = await res.json().catch(() => ({}))
  const msg =
    typeof err === 'object' && err !== null && 'detail' in err
      ? String((err as { detail?: unknown }).detail ?? res.statusText)
      : res.statusText
  return msg || `HTTP ${res.status}`
}

async function fetchFeed(): Promise<NotificationFeed> {
  const res = await apiFetch('/api/v1/notifications/feed?limit=30')
  if (!res.ok) throw new Error(await readError(res))
  return res.json() as Promise<NotificationFeed>
}

async function fetchUnreadCount(): Promise<number> {
  const res = await apiFetch('/api/v1/notifications/feed/unread-count')
  if (!res.ok) throw new Error(await readError(res))
  const data = (await res.json()) as { unread: number }
  return data.unread ?? 0
}

async function markRead(id: number): Promise<void> {
  const res = await apiFetch(`/api/v1/notifications/feed/${id}/read`, { method: 'POST' })
  if (!res.ok) throw new Error(await readError(res))
}

async function markAllRead(): Promise<void> {
  const res = await apiFetch('/api/v1/notifications/feed/read-all', { method: 'POST' })
  if (!res.ok) throw new Error(await readError(res))
}

const FEED_KEY = ['notifications', 'feed'] as const
const UNREAD_KEY = ['notifications', 'unread'] as const

/** Lightweight unread badge — polled frequently so the bell stays live. */
export function useNotificationsUnreadQuery(enabled = true) {
  return useQuery({
    queryKey: UNREAD_KEY,
    queryFn: fetchUnreadCount,
    enabled,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  })
}

/** Full feed — only fetched when the dropdown is open. */
export function useNotificationsFeedQuery(enabled: boolean) {
  return useQuery({
    queryKey: FEED_KEY,
    queryFn: fetchFeed,
    enabled,
    staleTime: 10_000,
  })
}

export function useNotificationsMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: FEED_KEY })
    void qc.invalidateQueries({ queryKey: UNREAD_KEY })
  }

  const markOne = useMutation({
    mutationFn: markRead,
    onSuccess: invalidate,
  })
  const markAll = useMutation({
    mutationFn: markAllRead,
    onSuccess: invalidate,
  })
  return { markOne, markAll }
}
