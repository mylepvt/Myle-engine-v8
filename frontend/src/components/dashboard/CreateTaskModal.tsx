import { useState } from 'react'
import { X, Loader2, Search, Check } from 'lucide-react'
import { useCreateTask, useBulkAssignTask } from '@/hooks/use-verification-query'
import { useTeamMembersQuery } from '@/hooks/use-team-query'

type Props = {
  open: boolean
  onClose: () => void
}

type Step = 'form' | 'assign' | 'done'

export function CreateTaskModal({ open, onClose }: Props) {
  const [step, setStep] = useState<Step>('form')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [taskType, setTaskType] = useState('CUSTOM')
  const [evidenceInstructions, setEvidenceInstructions] = useState('')
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [createdTaskId, setCreatedTaskId] = useState<number | null>(null)

  const createTask = useCreateTask()
  const bulkAssign = useBulkAssignTask()
  const { data: members = [] } = useTeamMembersQuery()

  const filtered = members.filter((m) => {
    const q = search.toLowerCase()
    return (
      (m.name && m.name.toLowerCase().includes(q)) ||
      (m.fbo_id && m.fbo_id.toLowerCase().includes(q))
    )
  })

  function toggleMember(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleCreate() {
    if (!title.trim()) return
    const res = await createTask.mutateAsync({
      title: title.trim(),
      description: description.trim() || undefined,
      task_type: taskType,
      evidence_instructions: evidenceInstructions.trim() || undefined,
    })
    const taskId = (res as { id?: number })?.id
    if (taskId) {
      setCreatedTaskId(taskId)
      setStep('assign')
    }
  }

  async function handleAssign() {
    if (!createdTaskId || selectedIds.size === 0) return
    await bulkAssign.mutateAsync({
      verification_task_id: createdTaskId,
      user_ids: Array.from(selectedIds),
    })
    setStep('done')
  }

  function handleClose() {
    setStep('form')
    setTitle('')
    setDescription('')
    setTaskType('CUSTOM')
    setEvidenceInstructions('')
    setSearch('')
    setSelectedIds(new Set())
    setCreatedTaskId(null)
    onClose()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
      onKeyDown={(e) => { if (e.key === 'Escape') handleClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="Create Task"
    >
      <div className="keyboard-safe-modal mx-4 w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            {step === 'form' && 'Create Task'}
            {step === 'assign' && 'Assign to Members'}
            {step === 'done' && 'Task Created'}
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
          <form onSubmit={(e) => { e.preventDefault(); handleCreate() }}>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Title *</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="field-input"
                  placeholder="e.g. Follow up on pending leads"
                  autoFocus
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="field-input resize-none"
                  rows={3}
                  placeholder="What needs to be done?"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Task Type</label>
                <select
                  value={taskType}
                  onChange={(e) => setTaskType(e.target.value)}
                  className="field-input"
                >
                  {['CUSTOM', 'FOLLOWUP', 'CALLING', 'TRAINING', 'COACHING', 'AUDIT', 'IMPLEMENTATION'].map((t) => (
                    <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Evidence Instructions</label>
                <textarea
                  value={evidenceInstructions}
                  onChange={(e) => setEvidenceInstructions(e.target.value)}
                  className="field-input resize-none"
                  rows={2}
                  placeholder="What evidence should the member submit? (optional)"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!title.trim() || createTask.isPending}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
              >
                {createTask.isPending ? <Loader2 className="size-4 animate-spin" /> : 'Create & Assign'}
              </button>
            </div>
          </form>
        )}

        {step === 'assign' && (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              Select team members to assign this task to. You can also skip and assign later.
            </p>
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="field-input pl-9"
                placeholder="Search members..."
                autoFocus
              />
            </div>
            <div className="max-h-60 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
              {filtered.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">No members found</p>
              )}
              {filtered.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleMember(m.id)}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition ${
                    selectedIds.has(m.id)
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground hover:bg-muted'
                  }`}
                >
                  <div className={`flex size-5 shrink-0 items-center justify-center rounded border transition ${
                    selectedIds.has(m.id)
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border'
                  }`}>
                    {selectedIds.has(m.id) && <Check className="size-3" />}
                  </div>
                  <span className="font-medium">{m.name || m.fbo_id}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{m.role}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {selectedIds.size} member(s) selected
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={handleAssign}
                disabled={selectedIds.size === 0 || bulkAssign.isPending}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
              >
                {bulkAssign.isPending ? <Loader2 className="size-4 animate-spin" /> : `Assign to ${selectedIds.size} member(s)`}
              </button>
            </div>
          </>
        )}

        {step === 'done' && (
          <>
            <div className="flex flex-col items-center py-6">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-emerald-500/15">
                <Check className="size-6 text-emerald-500" />
              </div>
              <p className="text-sm text-muted-foreground">
                {selectedIds.size > 0
                  ? `Task created and assigned to ${selectedIds.size} member(s).`
                  : 'Task created successfully.'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Members will see it in their task checklist.
              </p>
            </div>
            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
