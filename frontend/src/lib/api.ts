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

export type ApiFetchOptions = RequestInit & {
  skipAuthRetry?: boolean
}

let refreshInFlight: Promise<boolean> | null = null

function fetchWithCookies(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), {
    credentials: 'include',
    ...init,
  })
}

function shouldRetryAfter401(path: string): boolean {
  return ![
    '/api/v1/auth/login',
    '/api/v1/auth/dev-login',
    '/api/v1/auth/refresh',
  ].includes(path)
}

/**
 * Refresh the httpOnly session cookies once and share the result with any
 * concurrent 401 handlers so the UI does not fan out multiple refresh calls.
 */
export function silentAuthRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetchWithCookies('/api/v1/auth/refresh', {
          method: 'POST',
        })
        return res.ok
      } catch {
        return false
      }
    })().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

/** Browser fetch with cookies (JWT auth + silent refresh retry). */
export async function apiFetch(
  path: string,
  init?: ApiFetchOptions,
): Promise<Response> {
  const { skipAuthRetry = false, ...requestInit } = init ?? {}
  let response = await fetchWithCookies(path, requestInit)
  if (
    skipAuthRetry ||
    response.status !== 401 ||
    !shouldRetryAfter401(path)
  ) {
    return response
  }
  const refreshed = await silentAuthRefresh()
  if (!refreshed) {
    return response
  }
  response = await fetchWithCookies(path, requestInit)
  return response
}
