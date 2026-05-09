import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'

export type DownloadItem = {
  id: number
  title: string
  filename: string
  file_size: number
  mime_type: string
  description: string | null
  created_at: string
}

async function fetchDownloads(): Promise<DownloadItem[]> {
  const res = await apiFetch('/api/v1/downloads')
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg =
      typeof err === 'object' && err !== null && 'detail' in err
        ? String((err as { detail?: string }).detail ?? res.statusText)
        : res.statusText
    throw new Error(msg || `HTTP ${res.status}`)
  }
  return res.json() as Promise<DownloadItem[]>
}

export function useDownloadsQuery() {
  return useQuery({
    queryKey: ['downloads'],
    queryFn: fetchDownloads,
  })
}

async function uploadDownload(payload: {
  file: File
  title: string
  description: string
}): Promise<DownloadItem> {
  const fd = new FormData()
  fd.append('file', payload.file)
  fd.append('title', payload.title)
  fd.append('description', payload.description)

  const res = await apiFetch('/api/v1/downloads', {
    method: 'POST',
    body: fd,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg =
      typeof err === 'object' && err !== null && 'detail' in err
        ? String((err as { detail?: string }).detail ?? res.statusText)
        : res.statusText
    throw new Error(msg || `HTTP ${res.status}`)
  }
  return res.json() as Promise<DownloadItem>
}

async function deleteDownload(id: number): Promise<void> {
  const res = await apiFetch(`/api/v1/downloads/${id}`, { method: 'DELETE' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg =
      typeof err === 'object' && err !== null && 'detail' in err
        ? String((err as { detail?: string }).detail ?? res.statusText)
        : res.statusText
    throw new Error(msg || `HTTP ${res.status}`)
  }
}

export function useDownloadsMutations() {
  const qc = useQueryClient()
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['downloads'] })

  const upload = useMutation({
    mutationFn: uploadDownload,
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: deleteDownload,
    onSuccess: invalidate,
  })
  return { upload, remove }
}

export function getDownloadFileUrl(id: number): string {
  return `/api/v1/downloads/${id}/file`
}
