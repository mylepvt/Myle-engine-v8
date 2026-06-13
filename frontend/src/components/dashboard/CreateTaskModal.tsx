import { useMemo, useState } from 'react'
import {
  Check,
  ClipboardList,
  GraduationCap,
  Loader2,
  MessageSquare,
  PhoneCall,
  Search,
  Sparkles,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useCreateTask, useBulkAssignTask } from '@/hooks/use-verification-query'
import { useTeamMembersQuery } from '@/hooks/use-team-query'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onClose: () => void
}

type Target = 'team' | 'leaders' | 'custom'

type Template = {
  key: string
  label: string
  Icon: LucideIcon
  title: string
  task_type: string
  description?: string
  evidence_instructions?: string
}

const TEMPLATES: Template[] = [
  {
    key: 'calling',
    label: 'Daily calling',
    Icon: PhoneCall,
    title: 'Complete today’s calling target',
    task_type: 'CALLING',
    description: 'Make your assigned calls and log the outcomes.',
    evidence_instructions: 'Share today’s call count or a screenshot.',
  },
  {
    key: 'followup',
    label: 'Follow-up leads',
    Icon: ClipboardList,
    title: 'Follow up on pending leads',
    task_type: 'FOLLOWUP',
    description: 'Reach out to leads that need a follow-up today.',
    evidence_instructions: 'List the leads you followed up with.',
  },
  {
    key: 'report',
    label: 'Daily report',
    Icon: MessageSquare,
    title: 'Submit today’s daily report',
    task_type: 'FOLLOWUP',
    evidence_instructions: 'Confirm your daily report is submitted.',
  },
  {
    key: 'training',
    label: 'Training',
    Icon: GraduationCap,
    title: 'Complete the assigned training',
    task_type: 'TRAINING',
    evidence_instructions: 'Share the completed module / certificate.',
  },
  {
    key: 'coaching',
    label: 'Coaching call',
    Icon: Users,
    title: 'Attend the team coaching call',
    task_type: 'COACHING',
    evidence_instructions: 'Confirm attendance.',
  },
]

export function CreateTaskModal({ open, onClose }: Props) {
  const [step, setStep] = useState<'form' | 'done'>('form')
  const [templateKey, setTemplateKey] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [taskType, setTaskType] = useState('CUSTOM')
  const [evidenceInstructions, setEvidenceInstructions] = useState('')
  const [target, setTarget] = useState<Target>('team')
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [notifyWhatsApp, setNotifyWhatsApp] = useState(true)
  const [assignedCount, setAssignedCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const createTask = useCreateTask()
  const bulkAssign = useBulkAssignTask()
  const { data } = useTeamMembersQuery()
  const members = useMemo(() => data?.items ?? [], [data?.items])

  const teamIds = useMemo(() => members.filter((m) => m.role === 'team').map((m) => m.id), [members])
  const leaderIds = useMemo(() => members.filter((m) => m.role === 'leader').map((m) => m.id), [members])

  const targetIds = useMemo(() => {
    if (target === 'team') return teamIds
    if (target === 'leaders') return leaderIds
    return Array.from(selectedIds)
  }, [target, teamIds, leaderIds, selectedIds])

  const filtered = members.filter((m) => {
    const q = search.toLowerCase()
    return (m.name && m.name.toLowerCase().includes(q)) || (m.fbo_id && m.fbo_id.toLowerCase().includes(q))
  })

  function applyTemplate(t: Template) {
    setTemplateKey(t.key)
    setTitle(t.title)
    setDescription(t.description ?? '')
    setTaskType(t.task_type)
    setEvidenceInstructions(t.evidence_instructions ?? '')
  }

  function toggleMember(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function reset() {
    setStep('form')
    setTemplateKey(null)
    setTitle('')
    setDescription('')
    setTaskType('CUSTOM')
    setEvidenceInstructions('')
    setTarget('team')
    setSearch('')
    setSelectedIds(new Set())
    setNotifyWhatsApp(true)
    setAssignedCount(0)
    setError(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleSubmit() {
    setError(null)
    if (!title.trim()) {
      setError('Add a task title.')
      return
    }
    if (targetIds.length === 0) {
      setError('Pick who this task is for.')
      return
    }
    try {
      const res = await createTask.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        task_type: taskType,
        evidence_instructions: evidenceInstructions.trim() || undefined,
      })
      const taskId = (res as { id?: number })?.id
      if (!taskId) throw new Error('Could not create task')
      await bulkAssign.mutateAsync({
        verification_task_id: taskId,
        user_ids: targetIds,
        notify_via_whatsapp: notifyWhatsApp,
      })
      setAssignedCount(targetIds.length)
      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    }
  }

  if (!open) return null

  const busy = createTask.isPending || bulkAssign.isPending

  const targetTabs: { key: Target; label: string; count: number }[] = [
    { key: 'team', label: 'Team', count: teamIds.length },
    { key: 'leaders', label: 'Leaders', count: leaderIds.length },
    { key: 'custom', label: 'Pick people', count: selectedIds.size },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
      onKeyDown={(e) => { if (e.key === 'Escape') handleClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="Create Task"
    >
      <div className="keyboard-safe-modal w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">
            {step === 'done' ? 'Task assigned' : 'Create Task'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        {step === 'form' && (
          <form
            onSubmit={(e) => { e.preventDefault(); void handleSubmit() }}
            className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5"
          >
            {/* Templates */}
            <div>
              <label className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Sparkles className="size-3.5 text-primary" /> Quick templates
              </label>
              <div className="flex flex-wrap gap-2">
                {TEMPLATES.map((t) => {
                  const Icon = t.Icon
                  const active = templateKey === t.key
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => applyTemplate(t)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition',
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background text-foreground hover:border-primary/50',
                      )}
                    >
                      <Icon className="size-3.5" /> {t.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Task title *</label>
              <input
                value={title}
                onChange={(e) => { setTitle(e.target.value); setTemplateKey(null) }}
                className="field-input"
                placeholder="e.g. Follow up on pending leads"
                autoFocus
                required
              />
            </div>

            {/* Optional details */}
            <details className="group rounded-lg border border-border/60 bg-background/40">
              <summary className="cursor-pointer list-none px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground">
                Details (optional)
              </summary>
              <div className="space-y-3 px-3 pb-3">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="field-input resize-none"
                  rows={2}
                  placeholder="What needs to be done?"
                />
                <textarea
                  value={evidenceInstructions}
                  onChange={(e) => setEvidenceInstructions(e.target.value)}
                  className="field-input resize-none"
                  rows={2}
                  placeholder="What should they submit as proof? (optional)"
                />
              </div>
            </details>

            {/* Target: Team / Leaders / Pick */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Assign to</label>
              <div className="flex gap-2">
                {targetTabs.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTarget(t.key)}
                    className={cn(
                      'flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition',
                      target === t.key
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background text-foreground hover:border-primary/40',
                    )}
                  >
                    {t.label}
                    <span className="ml-1 text-xs opacity-70">({t.count})</span>
                  </button>
                ))}
              </div>

              {target === 'custom' && (
                <div className="mt-3">
                  <div className="relative mb-2">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="field-input pl-9"
                      placeholder="Search members…"
                    />
                  </div>
                  <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
                    {filtered.length === 0 && (
                      <p className="py-3 text-center text-sm text-muted-foreground">No members found</p>
                    )}
                    {filtered.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleMember(m.id)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition',
                          selectedIds.has(m.id) ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted',
                        )}
                      >
                        <span className={cn(
                          'flex size-5 shrink-0 items-center justify-center rounded border transition',
                          selectedIds.has(m.id) ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                        )}>
                          {selectedIds.has(m.id) && <Check className="size-3" />}
                        </span>
                        <span className="font-medium">{m.name || m.fbo_id}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{m.role}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* WhatsApp notify */}
            <label className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/40 p-3">
              <input
                type="checkbox"
                checked={notifyWhatsApp}
                onChange={(e) => setNotifyWhatsApp(e.target.checked)}
                className="size-4 accent-primary"
              />
              <span className="text-sm text-foreground">Notify on WhatsApp</span>
              <span className="ml-auto text-xs text-muted-foreground">they get an alert</span>
            </label>

            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!title.trim() || targetIds.length === 0 || busy}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                {busy ? 'Assigning…' : `Create & assign (${targetIds.length})`}
              </button>
            </div>
          </form>
        )}

        {step === 'done' && (
          <div className="px-6 py-8">
            <div className="flex flex-col items-center text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-emerald-500/15">
                <Check className="size-6 text-emerald-500" />
              </div>
              <p className="text-sm text-foreground">
                Task assigned to {assignedCount} {assignedCount === 1 ? 'person' : 'people'}.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                It shows on their dashboard checklist — they tick it off to complete.
              </p>
            </div>
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
