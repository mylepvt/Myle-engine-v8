import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'

export type NoteOut = {
  id: number
  lead_id: number
  user_id: number | null
  display_name: string | null
  body: string
  created_at: string
}

async function parseError(res: Response): Promise<never> {
  const err = await res.json().catch(() => ({}))
  const msg =
    typeof err === 'object' && err !== null && 'detail' in err
      ? String((err as { detail?: string }).detail ?? res.statusText)
      : res.statusText
  throw new Error(msg || `HTTP ${res.status}`)
}

async function fetchLeadNotes(leadId: number): Promise<NoteOut[]> {
  const res = await apiFetch(`/api/v1/leads/${leadId}/notes`)
  if (!res.ok) await parseError(res)
  return res.json()
}

async function createLeadNote(args: { leadId: number; body: string }): Promise<NoteOut> {
  const res = await apiFetch(`/api/v1/leads/${args.leadId}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: args.body }),
  })
  if (!res.ok) await parseError(res)
  return res.json()
}

async function deleteLeadNote(args: { leadId: number; noteId: number }): Promise<void> {
  const res = await apiFetch(`/api/v1/leads/${args.leadId}/notes/${args.noteId}`, {
    method: 'DELETE',
  })
  if (!res.ok) await parseError(res)
}

export function useLeadNotesQuery(leadId: number, enabled = true) {
  return useQuery({
    queryKey: ['lead-notes', leadId],
    queryFn: () => fetchLeadNotes(leadId),
    enabled,
  })
}

export function useAddLeadNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createLeadNote,
    onSuccess: (_data, vars) =>
      void qc.invalidateQueries({ queryKey: ['lead-notes', vars.leadId] }),
  })
}

export function useDeleteLeadNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteLeadNote,
    onSuccess: (_data, vars) =>
      void qc.invalidateQueries({ queryKey: ['lead-notes', vars.leadId] }),
  })
}
