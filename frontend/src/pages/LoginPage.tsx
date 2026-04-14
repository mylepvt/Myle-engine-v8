import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  IdCard,
  Loader2,
  Lock,
  Sparkles,
  X,
} from 'lucide-react'

import { AuthCard } from '@/components/auth/AuthCard'
import { IconInput } from '@/components/auth/IconInput'
import { Button } from '@/components/ui/button'
import { authDevLogin, authPasswordLogin, DEV_SEED_PASSWORD } from '@/lib/auth-api'
import { fetchAuthMe } from '@/hooks/use-auth-me-query'
import { DEFAULT_META, useMetaQuery } from '@/hooks/use-meta-query'
import {
  playUiButton,
  playUiTap,
} from '@/lib/ui-sound'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { useRoleStore } from '@/stores/role-store'
import {
  devFboIdForRole,
  ROLES,
  roleShortLabel,
  type Role,
} from '@/types/role'

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
          ? `Enter password (dev: ${DEV_SEED_PASSWORD})`
          : 'Enter your password.',
      )
      return
    }
    if (!fboId.trim()) {
      setError('Enter your FBO ID or username.')
      return
    }
    setPwPending(true)
    playUiButton()
    try {
      await authPasswordLogin(fboId, password, rememberMe)
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
      navigate(from, { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not continue')
    } finally {
      setPwPending(false)
    }
  }

  async function handleContinue() {
    setError(null)
    setPending(true)
    playUiButton()
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
      navigate(from, { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not continue')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-[12%] h-80 w-80 rounded-full bg-primary/[0.09] blur-3xl" />
        <div className="absolute -right-16 bottom-[18%] h-72 w-72 rounded-full bg-white/[0.03] blur-3xl" />
      </div>

      <div className="relative z-[1] w-full max-w-[min(100%,26rem)] animate-fade-in">
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => playUiTap()}
        >
          <ArrowLeft className="size-4 shrink-0 opacity-80" aria-hidden />
          Home
        </Link>

        <AuthCard
          variant="center"
          icon={Sparkles}
          title="Welcome back"
          subtitle="Let's get you inside"
          footer={
            <p className="text-sm text-muted-foreground">
              New?{' '}
              <Link
                to="/register"
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                onClick={() => playUiTap()}
              >
                Register
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
              <span className="min-w-0 flex-1">Access your system to continue.</span>
              <button
                type="button"
                className="shrink-0 rounded-md p-1 text-amber-200/90 transition-colors hover:bg-amber-500/20 hover:text-amber-50"
                onClick={() => setShowGateBanner(false)}
                aria-label="Dismiss"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : null}

          {devLoginAllowed ? (
            <div className="space-y-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-4">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-amber-200/90">
                Dev preview
              </p>
              <label className="sr-only" htmlFor="login-role">
                Role
              </label>
              <select
                id="login-role"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                disabled={pending}
                className="field-input w-full appearance-none bg-muted/40"
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
                    One moment…
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="size-4" aria-hidden />
                  </>
                )}
              </Button>
            </div>
          ) : null}

          {error ? (
            <div
              key={error}
              className="animate-shake rounded-xl border border-destructive/40 bg-destructive/[0.12] px-3 py-2.5 text-center text-sm text-destructive"
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
              <div className="space-y-3.5">
                <div>
                  <label className="sr-only" htmlFor="login-fbo-id">
                    FBO ID or username
                  </label>
                  <IconInput
                    id="login-fbo-id"
                    autoComplete="username"
                    value={fboId}
                    onChange={(e) => setFboId(e.target.value)}
                    disabled={pwPending}
                    placeholder="FBO ID or Username"
                    icon={IdCard}
                  />
                </div>

                <div>
                  <label className="sr-only" htmlFor="login-password">
                    Password
                  </label>
                  <IconInput
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
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
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="size-4 rounded border-white/25 bg-muted/40 text-primary accent-primary focus:ring-2 focus:ring-primary/40"
                  />
                  <span className="select-none">Stay signed in</span>
                </label>
                <button
                  type="button"
                  className="text-sm font-semibold text-primary/90 hover:underline"
                  onClick={(e) => e.preventDefault()}
                >
                  Forgot?
                </button>
              </div>

              <Button
                type="submit"
                variant="default"
                className="mt-6 h-11 w-full gap-2 text-base font-semibold shadow-lg shadow-primary/20"
                disabled={pwPending}
              >
                {pwPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    One moment…
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="size-4" aria-hidden />
                  </>
                )}
              </Button>
            </div>
          </form>
        </AuthCard>

        <p className="mt-5 text-center text-[0.7rem] leading-relaxed text-muted-foreground/85">
          Encrypted connection · your data stays private
        </p>
      </div>
    </div>
  )
}
