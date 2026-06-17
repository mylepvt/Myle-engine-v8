import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'

export type ReactionSummary = {
  emoji: string
  count: number
  reacted_by_me: boolean
}

export type NoticeBoardItem = {
  id: number
  message: string
  created_by: string
  pin: boolean
  created_at: string
  reactions: ReactionSummary[]
}

export type NoticeBoardPayload = {
  items: NoticeBoardItem[]
  total: number
  note: string | null
}

async function fetchNoticeBoard(): Promise<NoticeBoardPayload> {
  const res = await apiFetch('/api/v1/other/notice-board')
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg =
      typeof err === 'object' && err !== null && 'error' in err
        ? String((err as { error?: { message?: string } }).error?.message ?? res.statusText)
        : res.statusText
    throw new Error(msg || `HTTP ${res.status}`)
  }
  return res.json() as Promise<NoticeBoardPayload>
}

export function useNoticeBoardQuery() {
  return useQuery({
    queryKey: ['other', 'notice-board'],
    queryFn: fetchNoticeBoard,
  })
}

export async function createAnnouncement(body: {
  message: string
  pin: boolean
}): Promise<NoticeBoardItem> {
  const res = await apiFetch('/api/v1/other/notice-board', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg =
      typeof err === 'object' && err !== null && 'error' in err
        ? String((err as { error?: { message?: string } }).error?.message ?? res.statusText)
        : res.statusText
    throw new Error(msg || `HTTP ${res.status}`)
  }
  return res.json() as Promise<NoticeBoardItem>
}

export async function deleteAnnouncement(id: number): Promise<void> {
  const res = await apiFetch(`/api/v1/other/notice-board/${id}`, { method: 'DELETE' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg =
      typeof err === 'object' && err !== null && 'error' in err
        ? String((err as { error?: { message?: string } }).error?.message ?? res.statusText)
        : res.statusText
    throw new Error(msg || `HTTP ${res.status}`)
  }
}

export async function toggleReaction(id: number, emoji: string): Promise<NoticeBoardItem> {
  const res = await apiFetch(`/api/v1/other/notice-board/${id}/react`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emoji }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg =
      typeof err === 'object' && err !== null && 'error' in err
        ? String((err as { error?: { message?: string } }).error?.message ?? res.statusText)
        : res.statusText
    throw new Error(msg || `HTTP ${res.status}`)
  }
  return res.json() as Promise<NoticeBoardItem>
}

export async function togglePinAnnouncement(id: number): Promise<NoticeBoardItem> {
  const res = await apiFetch(`/api/v1/other/notice-board/${id}/toggle-pin`, {
    method: 'POST',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg =
      typeof err === 'object' && err !== null && 'error' in err
        ? String((err as { error?: { message?: string } }).error?.message ?? res.statusText)
        : res.statusText
    throw new Error(msg || `HTTP ${res.status}`)
  }
  return res.json() as Promise<NoticeBoardItem>
}

export function useNoticeBoardMutations() {
  const qc = useQueryClient()
  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: ['other', 'notice-board'] })

  const create = useMutation({
    mutationFn: createAnnouncement,
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: deleteAnnouncement,
    onSuccess: invalidate,
  })
  const togglePin = useMutation({
    mutationFn: togglePinAnnouncement,
    onSuccess: invalidate,
  })
  const react = useMutation({
    mutationFn: ({ id, emoji }: { id: number; emoji: string }) =>
      toggleReaction(id, emoji),
    onSuccess: invalidate,
  })
  return { create, remove, togglePin, react }
}
