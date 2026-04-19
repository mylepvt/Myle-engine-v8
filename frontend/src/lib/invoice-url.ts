import { apiUrl } from '@/lib/api'

export function invoiceDownloadUrl(invoiceNumber: string): string {
  return apiUrl(`/invoice/${encodeURIComponent(invoiceNumber)}/download`)
}
