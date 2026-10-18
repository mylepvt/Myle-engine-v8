import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/api-error'

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
  /** Voice notice: stream URL (null for text-only notices). */
  audio_url?: string | null
  audio_duration_sec?: number | null
  played_by_me?: boolean
  reply_count?: number
  /** Admin only. */
  played_count?: number | null
  audience_count?: number | null
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

export async function createVoiceNotice(body: {
  audio: Blob
  message: string
  pin: boolean
  durationSec: number
}): Promise<NoticeBoardItem> {
  const type = body.audio.type
  const ext = type.includes('wav') ? 'wav' : type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'
  const form = new FormData()
  form.append('file', body.audio, `voice-notice.${ext}`)
  form.append('message', body.message)
  form.append('pin', body.pin ? 'true' : 'false')
  form.append('duration_sec', String(Math.max(1, Math.round(body.durationSec))))
  const res = await apiFetch('/api/v1/other/notice-board/voice', { method: 'POST', body: form })
  if (!res.ok) throw new Error(await getApiErrorMessage(res))
  return res.json() as Promise<NoticeBoardItem>
}

/** Fire-and-forget: tells the server this member played (or finished) a voice notice. */
export async function markNoticePlayed(id: number, completed: boolean): Promise<void> {
  try {
    await apiFetch(`/api/v1/other/notice-board/${id}/played`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    })
  } catch {
    /* tracking must never interrupt playback */
  }
}

export type ListenerRow = {
  user_id: number
  name: string
  role: string
  fbo_id: string | null
  first_played_at: string | null
  last_played_at: string | null
  play_count: number
  completed: boolean
}

export type ListenersPayload = {
  announcement_id: number
  audience_count: number
  played: ListenerRow[]
  not_played: ListenerRow[]
}

export function useNoticeListenersQuery(id: number | null) {
  return useQuery({
    queryKey: ['other', 'notice-board', id, 'listeners'],
    enabled: id != null,
    queryFn: async (): Promise<ListenersPayload> => {
      const res = await apiFetch(`/api/v1/other/notice-board/${id}/listeners`)
      if (!res.ok) throw new Error(await getApiErrorMessage(res))
      return res.json() as Promise<ListenersPayload>
    },
  })
}

export type NoticeReply = {
  id: number
  announcement_id: number
  user_id: number
  author: string
  role: string
  body: string
  created_at: string
  mine: boolean
  can_delete: boolean
}

export function useNoticeRepliesQuery(id: number, enabled: boolean) {
  return useQuery({
    queryKey: ['other', 'notice-board', id, 'replies'],
    enabled,
    queryFn: async (): Promise<{ items: NoticeReply[]; total: number }> => {
      const res = await apiFetch(`/api/v1/other/notice-board/${id}/replies`)
      if (!res.ok) throw new Error(await getApiErrorMessage(res))
      return res.json() as Promise<{ items: NoticeReply[]; total: number }>
    },
  })
}

export function useNoticeReplyMutations(id: number) {
  const qc = useQueryClient()
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['other', 'notice-board', id, 'replies'] })
    void qc.invalidateQueries({ queryKey: ['other', 'notice-board'], exact: true })
  }
  const add = useMutation({
    mutationFn: async (body: string): Promise<NoticeReply> => {
      const res = await apiFetch(`/api/v1/other/notice-board/${id}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      if (!res.ok) throw new Error(await getApiErrorMessage(res))
      return res.json() as Promise<NoticeReply>
    },
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: async (replyId: number): Promise<void> => {
      const res = await apiFetch(`/api/v1/other/notice-board/${id}/replies/${replyId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await getApiErrorMessage(res))
    },
    onSuccess: refresh,
  })
  return { add, remove }
}

export function useNoticeBoardMutations() {
  const qc = useQueryClient()
  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: ['other', 'notice-board'] })

  const create = useMutation({
    mutationFn: createAnnouncement,
    onSuccess: invalidate,
  })
  const createVoice = useMutation({
    mutationFn: createVoiceNotice,
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
  return { create, createVoice, remove, togglePin, react }
}
