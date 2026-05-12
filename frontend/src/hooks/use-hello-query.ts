import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'
import { messageFromApiErrorPayload } from '@/lib/http-error-message'

async function fetchHello(): Promise<{ message: string }> {
  const res = await apiFetch('/api/v1/hello')
  if (!res.ok) {
    const text = await res.text()
    let body: unknown = null
    try { body = JSON.parse(text) } catch { /* parse error */ }
    const msg = messageFromApiErrorPayload(body, `HTTP ${res.status}`)
    throw new Error(msg)
  }
  return res.json()
}

export function useHelloQuery() {
  return useQuery({
    queryKey: ['hello'],
    queryFn: fetchHello,
  })
}
