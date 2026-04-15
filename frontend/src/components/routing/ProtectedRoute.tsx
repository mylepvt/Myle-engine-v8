import { useEffect } from 'react'
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { useAuthStore } from '@/stores/auth-store'

/**
 * Admits users only when **`GET /api/v1/auth/me`** reports `authenticated`.
 * Zustand is kept in sync for the rest of the shell; the server is the source of truth.
 */
export function ProtectedRoute() {
  const location = useLocation()
  const login = useAuthStore((s) => s.login)
  const logout = useAuthStore((s) => s.logout)
  const { data, error, isPending, isError, refetch, isRefetching } = useAuthMeQuery({
    staleTime: 0,
    refetchOnMount: 'always',
  })
  const authErrorCode = isError ? /HTTP\s+(\d+)/.exec(String(error))?.[1] : null

  useEffect(() => {
    if (data?.authenticated) {
      login()
    } else if (data && !data.authenticated) {
      logout()
    }
  }, [data, login, logout])

  if (isPending && data === undefined) {
    return (
      <div
        className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6"
        aria-busy="true"
        aria-label="Checking session"
      >
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
    )
  }

  if (isError) {
    if (authErrorCode === '401') {
      return <Navigate to="/login" replace state={{ from: location.pathname }} />
    }
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm text-destructive" role="alert">
          Could not verify your session. Check API URL/network and retry.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" variant="secondary" disabled={isRefetching} onClick={() => void refetch()}>
            {isRefetching ? 'Retrying…' : 'Retry'}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link to="/login" state={{ from: location.pathname }}>
              Sign in
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  if (!data?.authenticated) {
    return (
      <Navigate to="/login" replace state={{ from: location.pathname }} />
    )
  }

  return <Outlet />
}
