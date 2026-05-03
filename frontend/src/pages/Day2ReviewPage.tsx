import { Link } from 'react-router-dom'
import { FileText, Headphones, MessageSquareText, ShieldCheck, Video } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { useDay2ReviewQuery } from '@/hooks/use-day2-review-query'
import { apiUrl } from '@/lib/api'

type Props = {
  title: string
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function resolveAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null
  return url.startsWith('http') ? url : apiUrl(url)
}

function batchSubmissionLabel(slot: string): string {
  const match = slot.match(/^d(\d+)_(.+)$/)
  if (!match) return slot.replace(/_/g, ' ')
  return `Day ${match[1]} ${match[2].replace(/_/g, ' ')}`
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: number
  hint: string
}) {
  return (
    <Card className="surface-elevated border-border/60">
      <CardContent className="space-y-2 p-4">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">{label}</p>
        <p className="font-heading text-3xl text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}

export function Day2ReviewPage({ title }: Props) {
  const query = useDay2ReviewQuery()
  const submissions = query.data?.submissions ?? []

  return (
    <div className="space-y-6">
      <div className="max-w-4xl space-y-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground">
          Admin-only review wall for Day 2 notes, voice notes, and videos. Reassignment stays in Lead Control.
        </p>
      </div>

      {query.isPending ? (
        <Card className="surface-elevated">
          <CardContent className="p-6">
            <LoadingState label="Loading Day 2 review..." />
          </CardContent>
        </Card>
      ) : null}

      {query.isError ? (
        <ErrorState
          title="Could not load Day 2 review"
          message={query.error instanceof Error ? query.error.message : 'Please try again.'}
          onRetry={() => void query.refetch()}
        />
      ) : null}

      {query.data ? (
        <>
          <Card className="surface-elevated border-primary/15 bg-primary/5">
            <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <ShieldCheck className="size-4 text-primary" />
                  Dedicated Day 2 admin review
                </div>
                <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                  {query.data.note}
                </p>
              </div>
              <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                Admin only
              </span>
            </CardContent>
          </Card>

          <section className="grid gap-4 md:grid-cols-4">
            <StatCard
              label="Recent Wall"
              value={query.data.total}
              hint="Stored Day 2 submissions available for admin review."
            />
            <StatCard
              label="Notes"
              value={query.data.notes_count}
              hint="Submissions that include text notes or notes file."
            />
            <StatCard
              label="Voice"
              value={query.data.voice_count}
              hint="Voice-note uploads received on Day 2."
            />
            <StatCard
              label="Video"
              value={query.data.video_count}
              hint="Practice videos submitted on Day 2."
            />
          </section>

          <Card className="surface-elevated border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageSquareText className="size-4" />
                Review Wall
              </CardTitle>
              <CardDescription>
                Recent Day 2 uploads across notes, voice, and video. Open the lead only when deeper context is needed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {submissions.length === 0 ? (
                <EmptyState
                  title="No Day 2 submissions yet"
                  description="Once a lead uploads notes, voice, or video in Day 2, it will appear here."
                />
              ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                  {submissions.map((submission) => {
                    const notesUrl = resolveAssetUrl(submission.notes_url)
                    const voiceUrl = resolveAssetUrl(submission.voice_note_url)
                    const videoUrl = resolveAssetUrl(submission.video_url)
                    return (
                      <div key={submission.submission_id} className="surface-inset space-y-3 rounded-2xl p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-foreground">{submission.lead_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {batchSubmissionLabel(submission.slot)} · {formatDateTime(submission.submitted_at)}
                            </p>
                          </div>
                          <Button asChild size="sm" variant="secondary">
                            <Link to={`/dashboard/work/leads/${submission.lead_id}`}>Open lead</Link>
                          </Button>
                        </div>

                        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                          <p>
                            Assignee: <span className="text-foreground">{submission.assigned_to_name}</span>
                          </p>
                          <p>
                            Owner: <span className="text-foreground">{submission.owner_name}</span>
                          </p>
                        </div>

                        {submission.notes_text_preview ? (
                          <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              Notes preview
                            </p>
                            <p className="mt-2 text-sm leading-relaxed text-foreground/90">
                              {submission.notes_text_preview}
                            </p>
                          </div>
                        ) : null}

                        <div className="flex flex-wrap gap-2">
                          {notesUrl ? (
                            <Button asChild size="sm" variant="outline">
                              <a href={notesUrl} target="_blank" rel="noopener noreferrer">
                                <FileText className="mr-1 size-4" />
                                Notes file
                              </a>
                            </Button>
                          ) : null}
                          {voiceUrl ? (
                            <Button asChild size="sm" variant="outline">
                              <a href={voiceUrl} target="_blank" rel="noopener noreferrer">
                                <Headphones className="mr-1 size-4" />
                                Voice note
                              </a>
                            </Button>
                          ) : null}
                          {videoUrl ? (
                            <Button asChild size="sm" variant="outline">
                              <a href={videoUrl} target="_blank" rel="noopener noreferrer">
                                <Video className="mr-1 size-4" />
                                Video
                              </a>
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
