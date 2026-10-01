import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * "← Back" that returns to where the user came from — or, when the page was
 * opened directly (notification tap, shared link, app cold start), to
 * `fallback` instead of leaving the app or doing nothing.
 */
export function useGoBack(fallback = '/dashboard') {
  const navigate = useNavigate()
  return useCallback(() => {
    // react-router keeps the in-app history index in history.state.idx.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate(fallback, { replace: true })
  }, [navigate, fallback])
}
