import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

function isEnrollmentApprovalsPath(pathname: string): boolean {
  return pathname.includes('/team/enrollment-approvals')
}

/**
 * When pending Enroll count increases while the user is not on the approvals page,
 * surfaces an in-app banner. Optionally fires `Notification` if permission is already granted.
 */
export function useEnrollmentApprovalsAlertBanner(
  pendingTotal: number,
  options: { enabled: boolean },
): { open: boolean; delta: number; dismiss: () => void } {
  const location = useLocation()
  const prev = useRef<number | null>(null)
  const [open, setOpen] = useState(false)
  const [delta, setDelta] = useState(0)

  const onApprovalsPage = isEnrollmentApprovalsPath(location.pathname)

  useEffect(() => {
    if (!options.enabled) return
    if (pendingTotal < 0) return

    if (prev.current === null) {
      prev.current = pendingTotal
      return
    }

    if (pendingTotal > prev.current) {
      const d = pendingTotal - prev.current
      if (!onApprovalsPage) {
        setDelta(d)
        setOpen(true)
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try {
            new Notification('Myle — Enroll approvals', {
              body:
                d === 1
                  ? '1 new FLP invoice needs review.'
                  : `${d} new FLP invoices need review.`,
            })
          } catch {
            /* ignore */
          }
        }
      }
    }

    prev.current = pendingTotal
  }, [pendingTotal, onApprovalsPage, options.enabled])

  useEffect(() => {
    if (onApprovalsPage) setOpen(false)
  }, [onApprovalsPage])

  const dismiss = useCallback(() => setOpen(false), [])

  return { open, delta, dismiss }
}
