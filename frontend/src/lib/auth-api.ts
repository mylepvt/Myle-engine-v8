import { apiFetch } from '@/lib/api'
import type { Role } from '@/types/role'

export async function authDevLogin(role: Role): Promise<void> {
  const res = await apiFetch('/api/v1/auth/dev-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  })
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error('Dev login is off (set AUTH_DEV_LOGIN_ENABLED on the API).')
    }
    throw new Error(`HTTP ${res.status}`)
  }
}

/** Matches backend `DEV_LOGIN_PASSWORD_PLAIN` for seeded dev users after migrations. */
export const DEV_SEED_PASSWORD = 'myle-dev-login'

export async function authPasswordLogin(
  fboId: string,
  password: string,
  rememberMe = false,
): Promise<void> {
  const res = await apiFetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fbo_id: fboId.trim(), password, remember_me: rememberMe }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg =
      typeof err === 'object' && err !== null && 'error' in err
        ? String((err as { error?: { message?: string } }).error?.message ?? res.statusText)
        : res.statusText
    throw new Error(msg || `HTTP ${res.status}`)
  }
}

/** Rotates access + refresh cookies using the httpOnly refresh cookie. */
export async function authRefresh(): Promise<void> {
  const res = await apiFetch('/api/v1/auth/refresh', { method: 'POST' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg =
      typeof err === 'object' && err !== null && 'error' in err
        ? String((err as { error?: { message?: string } }).error?.message ?? res.statusText)
        : res.statusText
    throw new Error(msg || `HTTP ${res.status}`)
  }
}

export async function authLogout(): Promise<void> {
  const res = await apiFetch('/api/v1/auth/logout', { method: 'POST' })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
}

export type RegisterPayload = {
  username: string
  password: string
  email: string
  fbo_id: string
  upline_fbo_id: string
  phone: string
  is_new_joining: boolean
}

/** Self-serve signup — account stays pending until admin approves (Team role). */
export async function authRegister(body: RegisterPayload): Promise<{ message?: string }> {
  const res = await apiFetch('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as { message?: string; error?: { message?: string } }
  if (!res.ok) {
    const msg =
      typeof data.error?.message === 'string'
        ? data.error.message
        : res.statusText
    throw new Error(msg || `HTTP ${res.status}`)
  }
  return data
}

/** Reload JWT claims from DB (training completion, registration status, etc.). */
export async function authSyncIdentity(): Promise<void> {
  const res = await apiFetch('/api/v1/auth/sync-identity', { method: 'POST' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg =
      typeof err === 'object' && err !== null && 'error' in err
        ? String((err as { error?: { message?: string } }).error?.message ?? res.statusText)
        : res.statusText
    throw new Error(msg || `HTTP ${res.status}`)
  }
}
