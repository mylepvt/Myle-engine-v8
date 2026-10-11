import { apiFetch } from '@/lib/api'
import { messageFromApiErrorPayload } from '@/lib/http-error-message'

/** Fetch an authenticated PDF from the API and save it with the given file name. */
export async function downloadApiPdf(path: string, filename: string): Promise<void> {
  const res = await apiFetch(path)
  if (!res.ok) {
    const raw: unknown = await res.json().catch(() => null)
    throw new Error(messageFromApiErrorPayload(raw, res.statusText) || `HTTP ${res.status}`)
  }
  const blob = await res.blob()
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}

export function pdfFileSlug(name: string): string {
  return name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'certificate'
}
