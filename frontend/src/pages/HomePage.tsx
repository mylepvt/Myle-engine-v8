import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { authLogout } from '@/lib/auth-api'
import { t } from '@/lib/i18n'
import { useAuthStore } from '@/stores/auth-store'

export function HomePage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: me, isPending: mePending } = useAuthMeQuery()
  const logout = useAuthStore((s) => s.logout)
  const sessionKnown = !mePending || me !== undefined
  const sessionActive = Boolean(me?.authenticated)

  useEffect(() => {
    if (me?.authenticated) {
      navigate('/dashboard', { replace: true })
    } else if (sessionKnown && !me?.authenticated) {
      navigate('/login', { replace: true })
    }
  }, [me?.authenticated, sessionKnown, navigate])

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
      <header className="flex flex-1 flex-col justify-center gap-10">
        <div className="space-y-3 text-center">
          <p className="text-sm font-semibold text-primary">{t('appTitle')}</p>
          <h1 className="bg-gradient-to-br from-foreground via-foreground to-primary bg-clip-text font-heading text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
            Your team workspace
          </h1>
          <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
            {t('appTagline')}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild size="lg" className="gap-2">
            <Link to="/dashboard">
              Open app
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
          {!sessionKnown ? (
            <Button variant="secondary" size="lg" disabled>
              Checking session…
            </Button>
          ) : !sessionActive ? (
            <Button variant="secondary" size="lg" asChild>
              <Link to="/login">Sign in</Link>
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={async () => {
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
            </Button>
          )}
        </div>

        {/* Loading indicator while checking session */}
        {!sessionKnown && (
          <div className="flex justify-center py-4">
            <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
      </header>

      <footer className="mt-auto border-t border-white/[0.06] py-6 text-center text-[0.65rem] text-muted-foreground/80">
        © {new Date().getFullYear()} {t('appTitle')} · Internal use
      </footer>
    </div>
  )
}
