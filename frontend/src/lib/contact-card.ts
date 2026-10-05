import { apiFetch, apiUrl } from '@/lib/api'
import { messageFromApiErrorPayload } from '@/lib/http-error-message'

/**
 * Open an admin .vcf endpoint so the phone shows its native contact sheet
 * (iPhone: "Create New Contact" / "Add All Contacts"). We check the request with
 * apiFetch first (refreshes an expired session, surfaces errors), then navigate to
 * the URL itself — Safari only offers the contact sheet for a real navigation.
 */
export async function openContactCard(path: string): Promise<void> {
  const res = await apiFetch(path)
  if (!res.ok) {
    const raw: unknown = await res.json().catch(() => null)
    throw new Error(messageFromApiErrorPayload(raw, res.statusText) || `HTTP ${res.status}`)
  }
  window.location.assign(apiUrl(path))
}
