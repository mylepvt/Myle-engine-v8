import { useQuery } from '@tanstack/react-query'

import { apiFetch, silentAuthRefresh } from '@/lib/api'

export type MeResponse = {
  authenticated: boolean
  role: string | null
  user_id: number | null
  /** Globally unique account id (primary). */
  fbo_id: string | null
  username: string | null
  email: string | null
  /** Legacy session display_name / derived label (username or email local-part). */
  display_name: string | null
  /** JWT `ver` claim (legacy AUTH_SESSION_VERSION parity). */
  auth_version: number | null
  /** Legacy `training_status` (e.g. pending, completed, not_required). */
  training_status: string | null
  /** When true, full dashboard is gated until training is completed (legacy). */
  training_required: boolean | null
  /** pending | approved | rejected */
  registration_status: string | null
  /** Profile image path (use with `apiUrl()`). */
  avatar_url: string | null
}

const UNAUTH: MeResponse = {
  authenticated: false,
  role: null,
  user_id: null,
  fbo_id: null,
  username: null,
  email: null,
  display_name: null,
  auth_version: null,
  training_status: null,
  training_required: null,
  registration_status: null,
  avatar_url: null,
}

export async function fetchAuthMe(): Promise<MeResponse> {
  const readMe = async (): Promise<Response> =>
    apiFetch('/api/v1/auth/me', { skipAuthRetry: true })

  const normalize = (raw: Partial<MeResponse>): MeResponse => ({
    authenticated: Boolean(raw.authenticated),
    role: raw.role ?? null,
    user_id: raw.user_id ?? null,
    fbo_id: raw.fbo_id ?? null,
    username: raw.username ?? null,
    email: raw.email ?? null,
    display_name: raw.display_name ?? null,
    auth_version:
      typeof raw.auth_version === 'number' ? raw.auth_version : null,
    training_status:
      typeof raw.training_status === 'string' ? raw.training_status : null,
    training_required:
      typeof raw.training_required === 'boolean' ? raw.training_required : null,
    registration_status:
      typeof raw.registration_status === 'string'
        ? raw.registration_status
        : null,
    avatar_url:
      typeof raw.avatar_url === 'string' && raw.avatar_url.length > 0
        ? raw.avatar_url
        : null,
  })

  const readNormalized = async (): Promise<MeResponse | null> => {
    const res = await readMe()
    if (res.status === 401) {
      return null
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return normalize((await res.json()) as Partial<MeResponse>)
  }

  let me = await readNormalized()
  if (me?.authenticated) {
    return me
  }

  // `/auth/me` returns 200 + `authenticated=false` when the short-lived access
  // cookie expires, so try the refresh cookie once before treating the session
  // as logged out.
  const refreshed = await silentAuthRefresh()
  // null = network error (server unreachable / deploy restart).
  // Throw so React Query enters error state with a retry button instead of
  // redirecting to login and destroying the session.
  if (refreshed === null) {
    throw new Error('Network error: could not reach auth server')
  }
  // false = server rejected token (401/403) → session genuinely expired
  if (!refreshed) {
    return UNAUTH
  }

  me = await readNormalized()
  if (!me?.authenticated) {
    return UNAUTH
  }
  return me
}

export type UseAuthMeQueryOptions = {
  /** Use `0` on route gates so each visit revalidates against the server. */
  staleTime?: number
  refetchOnMount?: boolean | 'always'
}

export function useAuthMeQuery(options?: UseAuthMeQueryOptions) {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: fetchAuthMe,
    staleTime: options?.staleTime ?? 30_000,
    refetchOnMount: options?.refetchOnMount ?? true,
  })
}
