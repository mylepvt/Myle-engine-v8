import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Headphones, Mic, Type } from 'lucide-react'

import { NoticeListenersDialog } from '@/components/notice-board/NoticeListenersDialog'
import { NoticeReplies } from '@/components/notice-board/NoticeReplies'
import { VoiceNotePlayer } from '@/components/notice-board/VoiceNotePlayer'
import { VoiceRecorder, type VoiceRecording } from '@/components/notice-board/VoiceRecorder'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import {
  markNoticePlayed,
  useNoticeBoardMutations,
  useNoticeBoardQuery,
  type NoticeBoardPayload,
} from '@/hooks/use-notice-board-query'
import { useNoticeBoardUnread } from '@/hooks/use-notice-board-unread'
import { cn } from '@/lib/utils'
import { InlineEmpty } from '@/components/ui/states'

// emoji-ok: user reaction emoji are content
const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

type Props = { title: string }

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

function ReactionBar({
  reactions,
  announcementId,
  disabled,
  onReact,
}: {
  reactions: { emoji: string; count: number; reacted_by_me: boolean }[]
  announcementId: number
  disabled: boolean
  onReact: (id: number, emoji: string) => void
}) {
  const reactionMap = new Map(reactions.map((r) => [r.emoji, r]))
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {REACTION_EMOJIS.map((emoji) => {
        const r = reactionMap.get(emoji)
        return (
          <button
            key={emoji}
            type="button"
            disabled={disabled}
            onClick={() => onReact(announcementId, emoji)}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs leading-tight transition-colors',
              r?.reacted_by_me
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-border/60 text-muted-foreground hover:border-border hover:bg-muted/50',
            )}
          >
            <span className="text-sm leading-none">{emoji}</span>
            {r && r.count > 0 ? <span className="tabular-nums">{r.count}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

export function NoticeBoardPage({ title }: Props) {
  const { data: me } = useAuthMeQuery()
  const isAdmin = me?.authenticated && me.role === 'admin'
  const { data, isPending, isError, error, refetch } = useNoticeBoardQuery()
  const { create, createVoice, remove, togglePin, react } = useNoticeBoardMutations()
  const qc = useQueryClient()

  const { markAllSeen } = useNoticeBoardUnread()

  // Mark all notices as seen when this page is visited
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { markAllSeen() }, [])

  const [mode, setMode] = useState<'text' | 'voice'>('text')
  const [message, setMessage] = useState('')
  const [pinNew, setPinNew] = useState(false)
  const [recording, setRecording] = useState<VoiceRecording | null>(null)
  const [recorderKey, setRecorderKey] = useState(0)
  const [formError, setFormError] = useState<string | null>(null)
  const [posted, setPosted] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)
  const [listenersFor, setListenersFor] = useState<number | null>(null)
  const posting = create.isPending || createVoice.isPending

  async function handlePost(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setPosted(null)
    const m = message.trim()
    try {
      if (mode === 'voice') {
        if (!recording) {
          setFormError('Record a voice note first.')
          return
        }
        await createVoice.mutateAsync({
          audio: recording.blob,
          message: m,
          pin: pinNew,
          durationSec: recording.durationSec,
        })
        setRecording(null)
        setRecorderKey((k) => k + 1)
        setPosted('Voice notice sent. Everyone is being notified.')
      } else {
        if (!m) {
          setFormError('Message cannot be empty.')
          return
        }
        await create.mutateAsync({ message: m, pin: pinNew })
        setPosted('Notice posted. Everyone is being notified.')
      }
      setMessage('')
      setPinNew(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not post')
    }
  }

  function markPlayedLocally(id: number) {
    qc.setQueryData<NoticeBoardPayload>(['other', 'notice-board'], (prev) =>
      prev
        ? { ...prev, items: prev.items.map((it) => (it.id === id ? { ...it, played_by_me: true } : it)) }
        : prev,
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-ds-h1">{title}</h1>
      <p className="text-sm text-muted-foreground">
        Organization notices and voice notes — pinned items appear first.
      </p>

      {isAdmin ? (
        <form
          onSubmit={(e) => void handlePost(e)}
          className="surface-elevated space-y-3 p-4 text-sm md:p-5"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-medium text-foreground">Post announcement</h2>
            <div className="inline-flex rounded-lg bg-muted/70 p-0.5" role="tablist" aria-label="Notice type">
              {(['text', 'voice'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  disabled={posting}
                  onClick={() => {
                    setMode(m)
                    setFormError(null)
                    setPosted(null)
                  }}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors',
                    mode === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
                  )}
                >
                  {m === 'text' ? <Type className="size-3.5" /> : <Mic className="size-3.5" />}
                  {m === 'text' ? 'Text' : 'Voice'}
                </button>
              ))}
            </div>
          </div>
          {mode === 'voice' ? (
            <VoiceRecorder key={recorderKey} disabled={posting} onChange={setRecording} />
          ) : null}
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={posting}
            rows={mode === 'voice' ? 2 : 4}
            maxLength={mode === 'voice' ? 2000 : undefined}
            placeholder={mode === 'voice' ? 'Add a caption (optional)…' : 'Type your announcement here…'}
            aria-label={mode === 'voice' ? 'Voice notice caption' : 'Announcement text'}
            className="w-full rounded-lg border border-border dark:border-white/[0.12] bg-muted/60 px-3 py-2.5 text-foreground shadow-glass-inset backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-primary/35"
          />
          <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
            <input
              type="checkbox"
              checked={pinNew}
              onChange={(e) => setPinNew(e.target.checked)}
              disabled={posting}
              className="size-4 rounded border-border dark:border-white/25 accent-primary"
            />
            Pin to top
          </label>
          {formError ? (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
          {posted ? (
            <p className="text-sm text-success-ink" role="status">
              {posted}
            </p>
          ) : null}
          <Button type="submit" disabled={posting || (mode === 'voice' && !recording)}>
            {posting ? (mode === 'voice' ? 'Sending voice note…' : 'Posting…') : mode === 'voice' ? 'Send voice notice' : 'Post'}
          </Button>
        </form>
      ) : null}

      {isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}
      {isError ? (
        <div className="text-sm text-destructive" role="alert">
          {error instanceof Error ? error.message : 'Could not load'}{' '}
          <button type="button" className="underline underline-offset-2" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {data ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Showing {data.items.length} of {data.total} notice{data.total === 1 ? '' : 's'}
          </p>
          {data.items.length === 0 ? (
            <InlineEmpty>No announcements yet.</InlineEmpty>
          ) : null}
          <ul className="space-y-3">
            {data.items.map((row) => (
              <li
                key={row.id}
                className={cn(
                  'surface-elevated rounded border p-4 text-sm',
                  row.pin ? 'border-primary/35 bg-primary/[0.06]' : 'border-border/60',
                )}
              >
                {row.pin ? (
                  <span className="mb-2 inline-block rounded-md bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
                    Pinned
                  </span>
                ) : null}
                {row.audio_url ? (
                  <>
                    <div className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Mic className="size-3.5" /> Voice notice
                      {!isAdmin && !row.played_by_me ? (
                        <span className="rounded-full bg-primary px-1.5 py-px text-ds-micro font-semibold text-primary-foreground">
                          New
                        </span>
                      ) : null}
                    </div>
                    <VoiceNotePlayer
                      id={row.id}
                      src={row.audio_url}
                      fallbackDuration={row.audio_duration_sec}
                      unplayed={!isAdmin && !row.played_by_me}
                      onStart={() => {
                        if (isAdmin) return
                        void markNoticePlayed(row.id, false)
                        markPlayedLocally(row.id)
                      }}
                      onFinish={() => {
                        if (!isAdmin) void markNoticePlayed(row.id, true)
                      }}
                    />
                    {row.message ? (
                      <p className="mt-2 whitespace-pre-wrap text-foreground">{row.message}</p>
                    ) : null}
                  </>
                ) : (
                  <p className="whitespace-pre-wrap text-foreground">{row.message}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {row.created_by} · {formatWhen(row.created_at)}
                  </span>
                  {isAdmin && row.audio_url && row.audience_count != null ? (
                    <button
                      type="button"
                      onClick={() => setListenersFor(row.id)}
                      className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/[0.06] px-2 py-0.5 font-medium text-primary hover:bg-primary/10"
                    >
                      <Headphones className="size-3.5" />
                      Played {row.played_count ?? 0}/{row.audience_count}
                    </button>
                  ) : null}
                </div>
                <ReactionBar
                  reactions={row.reactions}
                  announcementId={row.id}
                  disabled={react.isPending}
                  onReact={(id, emoji) => void react.mutateAsync({ id, emoji })}
                />
                <NoticeReplies noticeId={row.id} count={row.reply_count ?? 0} />
                {isAdmin ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={togglePin.isPending}
                      onClick={() => void togglePin.mutateAsync(row.id)}
                    >
                      {row.pin ? 'Unpin' : 'Pin'}
                    </Button>
                    {deleteConfirmId === row.id ? (
                      <>
                        <span className="self-center text-xs text-muted-foreground">Sure?</span>
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          disabled={remove.isPending}
                         
                          onClick={() => {
                            void remove.mutateAsync(row.id).finally(() => setDeleteConfirmId(null))
                          }}
                        >
                          Yes, delete
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteConfirmId(null)}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10"
                        disabled={remove.isPending}
                        onClick={() => setDeleteConfirmId(row.id)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {isAdmin ? <NoticeListenersDialog noticeId={listenersFor} onClose={() => setListenersFor(null)} /> : null}
    </div>
  )
}
