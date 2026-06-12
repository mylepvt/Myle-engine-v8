import { useState } from 'react'
import { AlertCircle, CheckCircle2, Clock, Eye, FileText, ListChecks, XCircle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useTodayTasks,
  usePendingVerifications,
  useBlockedTasks,
  useExecutionScore,
  useSubmitEvidence,
  useBlockTask,
  type TaskAssignmentPublic,
} from '@/hooks/use-verification-query'

const BLOCKER_OPTIONS = [
  { value: 'didnt_understand', label: "Didn't Understand" },
  { value: 'technical_issue', label: 'Technical Issue' },
  { value: 'fear', label: 'Fear' },
  { value: 'rejection', label: 'Rejection' },
  { value: 'no_prospects', label: 'No Prospects' },
  { value: 'time_management', label: 'Time Management' },
  { value: 'personal_issue', label: 'Personal Issue' },
  { value: 'other', label: 'Other' },
]

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
  submitted: { label: 'Submitted', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  verified: { label: 'Verified', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
  blocked: { label: 'Blocked', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' },
  result_produced: { label: 'Done', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' },
}

function TaskCard({ task }: { task: TaskAssignmentPublic }) {
  const [showSubmit, setShowSubmit] = useState(false)
  const [showBlock, setShowBlock] = useState(false)
  const [evidenceText, setEvidenceText] = useState('')
  const [blockerReason, setBlockerReason] = useState('')
  const [blockerNotes, setBlockerNotes] = useState('')

  const submitEvidence = useSubmitEvidence()
  const blockTask = useBlockTask()

  const badge = STATUS_BADGE[task.status] ?? { label: task.status, className: '' }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-tight">{task.task_title ?? `Task #${task.verification_task_id}`}</p>
          {task.evidence_instructions && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{task.evidence_instructions}</p>
          )}
        </div>
        <Badge className={`shrink-0 text-[10px] ${badge.className}`}>{badge.label}</Badge>
      </div>

      {task.blocker_reason && (
        <p className="text-xs text-orange-600 dark:text-orange-400">
          Blocked: {BLOCKER_OPTIONS.find(o => o.value === task.blocker_reason)?.label ?? task.blocker_reason}
        </p>
      )}

      {task.status === 'pending' && (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setShowSubmit(!showSubmit)}>
            <FileText className="mr-1 size-3" />
            Submit
          </Button>
          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setShowBlock(!showBlock)}>
            <XCircle className="mr-1 size-3" />
            Can't Do
          </Button>
        </div>
      )}

      {task.status === 'rejected' && (
        <div className="flex flex-col gap-1">
          {task.rejection_reason && (
            <p className="text-xs text-red-600 dark:text-red-400">Reason: {task.rejection_reason}</p>
          )}
          <Button size="sm" variant="outline" onClick={() => setShowSubmit(!showSubmit)}>
            <FileText className="mr-1 size-3" />
            Resubmit
          </Button>
        </div>
      )}

      {task.status === 'submitted' && (
        <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
          <Clock className="size-3" />
          Awaiting leader verification
        </div>
      )}

      {task.status === 'verified' && (
        <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
          <CheckCircle2 className="size-3" />
          Verified{task.verified_by_name ? ` by ${task.verified_by_name}` : ''}
        </div>
      )}

      {showSubmit && (
        <div className="flex flex-col gap-2">
          <textarea
            className="min-h-[60px] w-full resize-none rounded border p-2 text-xs"
            placeholder="Enter your evidence..."
            value={evidenceText}
            onChange={e => setEvidenceText(e.target.value)}
          />
          <Button
            size="sm"
            disabled={!evidenceText.trim() || submitEvidence.isPending}
            onClick={() => {
              submitEvidence.mutate({ assignmentId: task.id, evidenceText: evidenceText.trim() })
              setShowSubmit(false)
              setEvidenceText('')
            }}
          >
            {submitEvidence.isPending ? 'Submitting...' : 'Submit Evidence'}
          </Button>
        </div>
      )}

      {showBlock && (
        <div className="flex flex-col gap-2">
          <select
            className="rounded border p-2 text-xs"
            value={blockerReason}
            onChange={e => setBlockerReason(e.target.value)}
          >
            <option value="">Select reason...</option>
            {BLOCKER_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <textarea
            className="min-h-[50px] w-full resize-none rounded border p-2 text-xs"
            placeholder="Additional notes..."
            value={blockerNotes}
            onChange={e => setBlockerNotes(e.target.value)}
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={!blockerReason || blockTask.isPending}
            onClick={() => {
              blockTask.mutate({ assignmentId: task.id, blockerReason, blockerNotes })
              setShowBlock(false)
              setBlockerReason('')
              setBlockerNotes('')
            }}
          >
            {blockTask.isPending ? 'Blocking...' : 'Mark Blocked'}
          </Button>
        </div>
      )}
    </div>
  )
}

function SectionCard({
  icon,
  title,
  count,
  emptyMessage,
  tasks,
  loading,
}: {
  icon: React.ReactNode
  title: string
  count: number
  emptyMessage: string
  tasks: TaskAssignmentPublic[]
  loading: boolean
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          {icon}
          {title}
        </CardTitle>
        <Badge variant="secondary" className="text-xs">{count}</Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : tasks.length === 0 ? (
          <p className="py-2 text-center text-xs text-muted-foreground">{emptyMessage}</p>
        ) : (
          tasks.map(t => <TaskCard key={t.id} task={t} />)
        )}
      </CardContent>
    </Card>
  )
}

export function VerificationHomePanel() {
  const today = useTodayTasks()
  const pending = usePendingVerifications()
  const blocked = useBlockedTasks()
  const score = useExecutionScore()

  const loading = today.isPending || pending.isPending || blocked.isPending

  const todayTasks = today.data ?? []
  const pendingTasks = pending.data ?? []
  const blockedTasks = blocked.data ?? []

  if (!loading && todayTasks.length === 0 && pendingTasks.length === 0 && blockedTasks.length === 0) {
    return null
  }

  const execScore = score.data?.execution_score ?? 0

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <ListChecks className="size-4" />
          Verification
        </h2>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Score: </span>
          <span className={`font-bold tabular-nums ${
            execScore >= 80 ? 'text-green-600' : execScore >= 50 ? 'text-amber-600' : 'text-red-600'
          }`}>
            {loading ? '...' : execScore}
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SectionCard
          icon={<FileText className="size-4 text-blue-500" />}
          title="Today's Tasks"
          count={todayTasks.length}
          emptyMessage="All caught up!"
          tasks={todayTasks}
          loading={loading}
        />
        <SectionCard
          icon={<Eye className="size-4 text-purple-500" />}
          title="Pending Verification"
          count={pendingTasks.length}
          emptyMessage="Nothing pending"
          tasks={pendingTasks}
          loading={loading}
        />
        <SectionCard
          icon={<AlertCircle className="size-4 text-orange-500" />}
          title="Blocked"
          count={blockedTasks.length}
          emptyMessage="No blockers"
          tasks={blockedTasks}
          loading={loading}
        />
      </div>
    </div>
  )
}
