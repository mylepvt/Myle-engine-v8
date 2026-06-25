import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, MessageSquare } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { apiFetch } from '@/lib/api'

type FeedbackItem = {
  id: number
  user_id: number
  member_name: string
  member_role: string
  message: string
  created_at: string
}

function formatWhen(value: string) {
  return new Date(value).toLocaleString()
}

function roleLabel(role: string) {
  if (role === 'admin') return 'Admin'
  if (role === 'leader') return 'Leader'
  if (role === 'team') return 'Member'
  return role
}

export function DashboardFeedbackCard({ enabled = true }: { enabled?: boolean }) {
  const qc = useQueryClient()
  const { data: me } = useAuthMeQuery()
  const role = me?.role ?? null
  const isAdmin = role === 'admin'
  const canSubmit = role === 'team' || role === 'leader' || role === 'admin'
  const [message, setMessage] = useState('')

  const list = useQuery({
    queryKey: ['member-feedback-list'],
    enabled: enabled && isAdmin,
    queryFn: async () => {
      const res = await apiFetch('/api/v1/feedback?limit=100')
      if (!res.ok) throw new Error((await res.text()) || res.statusText)
      return res.json() as Promise<FeedbackItem[]>
    },
  })

  const submit = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/v1/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim() }),
      })
      if (!res.ok) throw new Error((await res.text()) || res.statusText)
      return res.json() as Promise<FeedbackItem>
    },
    onSuccess: () => {
      setMessage('')
      void qc.invalidateQueries({ queryKey: ['member-feedback-list'] })
    },
  })

  if (!enabled || !canSubmit) return null

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-ds-h3">
          <MessageSquare className="size-5 text-primary" aria-hidden />
          Share feedback
        </CardTitle>
        <CardDescription className="flex items-center gap-1.5">
          <Lock className="size-3.5 shrink-0" aria-hidden />
          Private — only the admin can read this. Your leader and teammates cannot. Share any complaint or concern openly.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="Anything you want to share privately with the admin…"
          disabled={submit.isPending}
          className="w-full rounded-lg border border-border dark:border-white/[0.12] bg-muted/60 px-3 py-2 text-sm text-foreground disabled:opacity-50"
        />
        <div className="flex items-center gap-3">
          <Button
            type="button"
            disabled={submit.isPending || message.trim().length === 0}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? 'Sending…' : 'Send feedback'}
          </Button>
          {submit.isSuccess ? (
            <span className="text-sm text-emerald-600 dark:text-emerald-400/90">Sent. Thank you.</span>
          ) : null}
          {submit.isError ? (
            <span className="text-sm text-destructive" role="alert">
              {submit.error instanceof Error ? submit.error.message : 'Failed to send'}
            </span>
          ) : null}
        </div>

        {isAdmin ? (
          <div className="mt-2 border-t border-border/40 pt-3">
            <p className="mb-2 text-ds-label uppercase tracking-wide text-muted-foreground">
              All member feedback (admin only)
            </p>
            {list.isPending ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : list.isError ? (
              <p className="text-sm text-destructive" role="alert">
                {list.error instanceof Error ? list.error.message : 'Failed to load'}
              </p>
            ) : (list.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No feedback yet.</p>
            ) : (
              <div className="space-y-2">
                {list.data!.map((item) => (
                  <div key={item.id} className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {item.member_name}
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                          {roleLabel(item.member_role)}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">{formatWhen(item.created_at)}</span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground">{item.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
