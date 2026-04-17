/**
 * - `VITE_API_URL` unset → local dev default (`localhost:8000`).
 * - `VITE_API_URL=""` → same origin as the page (unified API + static deploy).
 * - Otherwise → absolute API base (split static site + API).
 */
function resolveApiBase(): string {
  const v = import.meta.env.VITE_API_URL as string | undefined
  if (v === '') return ''
  if (v === undefined) return 'http://localhost:8000'
  return v.replace(/\/$/, '')
}

export const apiBase = resolveApiBase()

export function apiUrl(path: string): string {
  // base64 data URLs must be used as-is — don't prepend the API base
  if (path.startsWith('data:')) return path
  const base = apiBase.replace(/\/$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p}`
}

/** Browser fetch with cookies (JWT dev auth). */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), {
    credentials: 'include',
    ...init,
  })
}
