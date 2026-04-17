import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Eye,
  EyeOff,
  IdCard,
  Loader2,
  Lock,
  LogIn,
  Network,
  Shield,
  X,
} from 'lucide-react'

import { AuthCard } from '@/components/auth/AuthCard'
import { IconInput } from '@/components/auth/IconInput'
import { TerminalBootOverlay } from '@/components/auth/TerminalBootOverlay'
import { Button } from '@/components/ui/button'
import { authDevLogin, authPasswordLogin } from '@/lib/auth-api'
import { fetchAuthMe } from '@/hooks/use-auth-me-query'
import { DEFAULT_META, useMetaQuery } from '@/hooks/use-meta-query'
import { t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { useRoleStore } from '@/stores/role-store'
import {
  devFboIdForRole,
  ROLES,
  roleShortLabel,
  type Role,
} from '@/types/role'

/** Persists only the checkbox preference (server still controls cookie lifetime via `remember_me`). */
const REMEMBER_ME_PREF_KEY = 'myle_login_remember_me_pref'

function RequiredMark() {
  return (
    <span className="font-semibold text-primary" aria-hidden>
      *
    </span>
  )
}

export function LoginPage() {
  const { data: meta } = useMetaQuery()
  const devLoginAllowed = (meta ?? DEFAULT_META).auth_dev_login_enabled === true
  const login = useAuthStore((s) => s.login)
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const role = useRoleStore((s) => s.role)
  const setRole = useRoleStore((s) => s.setRole)
  const from =
    (location.state as { from?: string } | null)?.from ?? '/dashboard'

  const fromProtected = Boolean(
    (location.state as { from?: string } | null)?.from,
  )

  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [fboId, setFboId] = useState('')
  const [password, setPassword] = useState('')
  const [pwPending, setPwPending] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [showGateBanner, setShowGateBanner] = useState(fromProtected)
  const [showForgotHint, setShowForgotHint] = useState(false)
  const [bootUser, setBootUser] = useState<{
    name: string
    role: string
    fboId: string
  } | null>(null)

  useEffect(() => {
    try {
      const v = localStorage.getItem(REMEMBER_ME_PREF_KEY)
      if (v === '1') setRememberMe(true)
      if (v === '0') setRememberMe(false)
    } catch {
      /* private mode / blocked storage */
    }
  }, [])

  useEffect(() => {
    if (meta?.auth_dev_login_enabled) {
      setFboId((v) => (v === '' ? devFboIdForRole('leader') : v))
    }
  }, [meta?.auth_dev_login_enabled])

  async function handlePasswordLogin() {
    setError(null)
    if (!password.trim()) {
      setError(
        devLoginAllowed
          ? `Password is required. Use your assigned password.`
          : 'Please enter your password.',
      )
      return
    }
    if (!fboId.trim()) {
      setError('Please enter your FBO ID (or your saved username).')
      return
    }
    setPwPending(true)
    try {
      await authPasswordLogin(fboId, password, rememberMe)
      try {
        localStorage.setItem(REMEMBER_ME_PREF_KEY, rememberMe ? '1' : '0')
      } catch {
        /* ignore */
      }
      await queryClient.resetQueries({ queryKey: ['auth', 'me'] })
      let me = await queryClient.fetchQuery({
        queryKey: ['auth', 'me'],
        queryFn: fetchAuthMe,
      })
      if (!me.authenticated) {
        await new Promise((r) => setTimeout(r, 200))
        me = await queryClient.fetchQuery({
          queryKey: ['auth', 'me'],
          queryFn: fetchAuthMe,
        })
      }
      if (!me.authenticated) {
        window.location.assign(from)
        return
      }
      login()
      const displayName =
        (me.username?.trim() && me.username.split(/\s+/)[0]) ||
        me.fbo_id ||
        me.email?.split('@')[0]?.split(/[._-]/)[0] ||
        'USER'
      setBootUser({
        name: displayName,
        role: me.role ?? 'team',
        fboId: me.fbo_id ?? fboId,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed')
    } finally {
      setPwPending(false)
    }
  }

  async function handleContinue() {
    setError(null)
    setPending(true)
    try {
      await authDevLogin(role)
      await queryClient.resetQueries({ queryKey: ['auth', 'me'] })
      let me = await queryClient.fetchQuery({
        queryKey: ['auth', 'me'],
        queryFn: fetchAuthMe,
      })
      if (!me.authenticated) {
        await new Promise((r) => setTimeout(r, 200))
        me = await queryClient.fetchQuery({
          queryKey: ['auth', 'me'],
          queryFn: fetchAuthMe,
        })
      }
      if (!me.authenticated) {
        window.location.assign(from)
        return
      }
      login()
      const displayName =
        (me.username?.trim() && me.username.split(/\s+/)[0]) ||
        me.fbo_id ||
        me.email?.split('@')[0]?.split(/[._-]/)[0] ||
        'USER'
      setBootUser({
        name: displayName,
        role: me.role ?? role,
        fboId: me.fbo_id ?? '',
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed')
    } finally {
      setPending(false)
    }
  }

  if (bootUser) {
    return (
      <TerminalBootOverlay
        userName={bootUser.name}
        userRole={bootUser.role}
        userFboId={bootUser.fboId}
        onFinish={() => navigate(from, { replace: true })}
      />
    )
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-[12%] h-80 w-80 rounded-full bg-primary/[0.09] blur-3xl" />
        <div className="absolute -right-16 bottom-[18%] h-72 w-72 rounded-full bg-white/[0.03] blur-3xl" />
      </div>

      <div className="relative z-[1] w-full max-w-[min(100%,26rem)]">
        <AuthCard
          variant="center"
          icon={Network}
          iconNode={
            <div className="flex size-[3.25rem] items-center justify-center rounded-2xl shadow-lg"
              style={{ background: 'linear-gradient(145deg, #1a1008 0%, #0d0904 100%)', boxShadow: '0 4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(212,175,55,0.15)' }}
              aria-hidden>
              <svg width="30" height="28" viewBox="0 0 30 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 26V4L15 20L28 4V26" stroke="url(#gold)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
                <defs>
                  <linearGradient id="gold" x1="2" y1="4" x2="28" y2="26" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#F5D060"/>
                    <stop offset="50%" stopColor="#D4AF37"/>
                    <stop offset="100%" stopColor="#A07820"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
          }
          title="Welcome back"
          subtitle="Sign in to Myle Community"
          footer={
            <p className="text-sm text-muted-foreground">
              New team member?{' '}
              <Link
                to="/register"
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
              >
                Register here
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </p>
          }
        >
          {showGateBanner ? (
            <div
              className="flex items-start gap-2 rounded-xl border border-amber-500/35 bg-amber-500/[0.12] px-3 py-2.5 text-left text-sm text-amber-100/95"
              role="status"
            >
              <span className="min-w-0 flex-1">
                Please log in to continue.
              </span>
              <button
                type="button"
                className="shrink-0 rounded-md p-1 text-amber-200/90 transition-colors hover:bg-amber-500/20 hover:text-amber-50"
                onClick={() => setShowGateBanner(false)}
                aria-label="Dismiss notice"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : null}

          {devLoginAllowed ? (
            <div className="space-y-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-4">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-amber-200/90">
                Quick Access
              </p>
              <label className="field-label" htmlFor="login-role">
                Select role
              </label>
              <select
                id="login-role"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                disabled={pending}
                className="field-input appearance-none bg-muted/40"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleShortLabel(r)}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={pending}
                onClick={() => void handleContinue()}
              >
                {pending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Signing in…
                  </>
                ) : (
                  'Continue'
                )}
              </Button>
            </div>
          ) : null}

          {error ? (
            <div
              className="rounded-xl border border-destructive/40 bg-destructive/[0.12] px-3 py-2.5 text-center text-sm text-destructive"
              role="alert"
            >
              {error}
            </div>
          ) : null}

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              void handlePasswordLogin()
            }}
            noValidate
          >
            <div
              className={cn(
                devLoginAllowed ? 'border-t border-white/[0.08] pt-5' : '',
              )}
            >
              {devLoginAllowed ? (
                <p className="mb-4 text-center text-xs font-medium leading-relaxed text-muted-foreground sm:text-left">
                  Or sign in with your FBO ID and password (username still works if you have one).
                </p>
              ) : (
                <p className="mb-4 text-center text-xs text-muted-foreground">
                  Use your FBO ID and password to sign in.
                </p>
              )}

              <div className="space-y-3.5">
                <div>
                  <label
                    className="mb-1.5 flex flex-wrap items-baseline gap-1 text-sm font-semibold text-foreground"
                    htmlFor="login-fbo-id"
                  >
                    FBO ID
                    <RequiredMark />
                  </label>
                  <IconInput
                    id="login-fbo-id"
                    autoComplete="username"
                    value={fboId}
                    onChange={(e) => setFboId(e.target.value)}
                    disabled={pwPending}
                    placeholder="Your FBO ID"
                    icon={IdCard}
                  />
                  <p className="mt-1.5 text-[0.7rem] leading-relaxed text-muted-foreground/90">
                    Password is required. If you used a username before, enter it in this field instead of FBO.
                  </p>
                </div>

                <div>
                  <label
                    className="mb-1.5 flex flex-wrap items-baseline gap-1 text-sm font-semibold text-foreground"
                    htmlFor="login-password"
                  >
                    Password
                    <RequiredMark />
                  </label>
                  <IconInput
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      devLoginAllowed
                        ? 'Enter your password'
                        : 'Enter your password'
                    }
                    disabled={pwPending}
                    icon={Lock}
                    endAdornment={
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowPassword((s) => !s)}
                        className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </button>
                    }
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <label className="flex cursor-pointer items-center gap-2.5 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => {
                      const next = e.target.checked
                      setRememberMe(next)
                      try {
                        localStorage.setItem(REMEMBER_ME_PREF_KEY, next ? '1' : '0')
                      } catch {
                        /* ignore */
                      }
                    }}
                    className="size-4 rounded border-white/25 bg-muted/40 text-primary accent-primary focus:ring-2 focus:ring-primary/40"
                  />
                  <span className="select-none">Remember me</span>
                </label>
                <button
                  type="button"
                  className="text-sm font-semibold text-primary hover:underline"
                  onClick={() => setShowForgotHint(s => !s)}
                >
                  Forgot password?
                </button>
              </div>
              {showForgotHint && (
                <p className="mt-2 rounded-xl border border-primary/25 bg-primary/[0.08] px-3 py-2.5 text-center text-xs text-muted-foreground">
                  Contact your leader or admin to reset your password.
                </p>
              )}

              <Button
                type="submit"
                variant="default"
                className="mt-6 h-11 w-full gap-2 text-base font-semibold shadow-lg shadow-primary/20"
                disabled={pwPending}
              >
                {pwPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Signing in…
                  </>
                ) : (
                  <>
                    <LogIn className="size-4" aria-hidden />
                    Sign In
                  </>
                )}
              </Button>
            </div>
          </form>
        </AuthCard>

        <p className="mt-5 flex items-center justify-center gap-2 text-center text-[0.7rem] leading-relaxed text-muted-foreground/85">
          <Shield className="size-3.5 shrink-0 opacity-80" aria-hidden />
          Secure internal access · Credentials sent over HTTPS only.
        </p>
        <p className="mt-1 text-center text-[0.65rem] text-muted-foreground/60">
          {t('appTitle')} — {t('appTagline')}
        </p>
      </div>
    </div>
  )
}
