import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Shield } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useApiMetaQuery } from '@/hooks/use-api-meta-query'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { useHelloQuery } from '@/hooks/use-hello-query'
import { authLogout } from '@/lib/auth-api'
import { hapticLight } from '@/lib/haptics'
import { t } from '@/lib/i18n'
import { useAuthStore } from '@/stores/auth-store'

function displayFirstName(me: {
  display_name: string | null
  username: string | null
  fbo_id: string | null
}): string {
  const d = me.display_name?.trim()
  if (d) {
    const first = d.split(/\s+/)[0]
    if (first) return first
  }
  const u = me.username?.trim()
  if (u) return u
  const f = me.fbo_id?.trim()
  if (f) return f
  return 'there'
}

export function HomePage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data, error, isPending } = useHelloQuery()
  const { isPending: metaPending, isError: metaError } = useApiMetaQuery()
  const { data: me, isPending: mePending } = useAuthMeQuery()
  const logout = useAuthStore((s) => s.logout)
  const sessionKnown = !mePending || me !== undefined
  const sessionActive = Boolean(me?.authenticated)

  const systemsLoading = isPending || metaPending
  const systemsOk = !systemsLoading && !error && !metaError && Boolean(data)

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
      <header className="flex flex-1 flex-col justify-center gap-10 animate-fade-in">
        <div className="space-y-3 text-center">
          <p className="text-sm font-semibold text-primary">{t('appTitle')}</p>
          {!sessionKnown ? (
            <>
              <Skeleton className="mx-auto h-10 w-[85%] max-w-sm rounded-lg" />
              <Skeleton className="mx-auto h-4 w-4/5 max-w-md rounded-md" />
            </>
          ) : sessionActive && me ? (
            <>
              <h1 className="bg-gradient-to-br from-foreground via-foreground to-primary bg-clip-text font-heading text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
                Welcome, {displayFirstName(me)}
              </h1>
              <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
                Today&apos;s control panel is ready
              </p>
            </>
          ) : (
            <>
              <h1 className="bg-gradient-to-br from-foreground via-foreground to-primary bg-clip-text font-heading text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
                Your sales system
              </h1>
              <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
                Built for daily closing
              </p>
            </>
          )}
        </div>

        <div className="flex flex-col items-center gap-4">
          {!sessionKnown ? (
            <div className="flex w-full max-w-sm flex-col gap-3">
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-4 w-2/3 self-center rounded-md" />
            </div>
          ) : sessionActive ? (
            <>
              <Button
                asChild
                size="lg"
                className="w-full max-w-sm gap-2 sm:w-auto sm:min-w-[16rem]"
                onPointerDown={() => hapticLight(8)}
              >
                <Link to="/dashboard">
                  Enter Dashboard
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
              <button
                type="button"
                className="text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                onClick={async () => {
                  hapticLight(6)
                  try {
                    await authLogout()
                  } catch {
                    /* still clear local session */
                  }
                  logout()
                  await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
                  navigate('/login', { replace: true })
                }}
              >
                Sign out
              </button>
            </>
          ) : (
            <Button
              asChild
              size="lg"
              className="w-full max-w-sm gap-2 sm:w-auto sm:min-w-[14rem]"
              onPointerDown={() => hapticLight(8)}
            >
              <Link to="/login">
                Continue
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
          )}
        </div>

        <Card className="overflow-hidden border-white/[0.08] shadow-sm">
          <CardContent className="flex items-start gap-3 p-5">
            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              {systemsOk ? (
                <CheckCircle2 className="size-4" aria-hidden />
              ) : (
                <Shield className="size-4" aria-hidden />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-ds-body font-medium leading-snug">
                {systemsLoading ? 'Checking…' : systemsOk ? 'System active' : 'Connection issue'}
              </CardTitle>
              <div className="mt-2 min-h-[1.25rem] text-ds-body" aria-live="polite">
                {systemsLoading && (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full max-w-[14rem] animate-pulse rounded-md bg-muted/60" />
                    <Skeleton className="h-4 w-3/4 max-w-[10rem] animate-pulse rounded-md bg-muted/50" />
                  </div>
                )}
                {!systemsLoading && systemsOk && (
                  <p className="text-muted-foreground">All services running</p>
                )}
                {!systemsLoading && !systemsOk && (
                  <p className="text-muted-foreground">
                    We couldn&apos;t reach the system. Check your connection and try again.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </header>

      <footer className="mt-auto border-t border-white/[0.06] py-6 text-center text-[0.65rem] text-muted-foreground/80">
        © {new Date().getFullYear()} {t('appTitle')}
      </footer>
    </div>
  )
}
