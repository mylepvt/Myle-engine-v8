import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { MoreHorizontal } from 'lucide-react'

import { getDashboardNavIcon } from '@/config/dashboard-nav-icons'
import {
  DASHBOARD_ROUTE_DEFS,
  type DashboardRouteDef,
  resolveTitleForPath,
  routeDefAccessible,
} from '@/config/dashboard-registry'
import { cn } from '@/lib/utils'
import type { Role } from '@/types/role'

const TAB_ORDER = ['', 'work/leads', 'work/workboard'] as const

/** Short labels for tab bar (iOS-style compact). */
const SHORT_LABEL: Record<string, string> = {
  '': 'Home',
  'work/leads': 'Calls',
  'work/workboard': 'Board',
  'work/follow-ups': 'Tasks',
  'team/members': 'Members',
}

type Props = {
  role: Role
  /** Legacy-style gate: only Training until completed */
  trainingLocked?: boolean
  onOpenMenu: () => void
  keyboardOpen?: boolean
  scrolled?: boolean
}

function defForPath(path: string) {
  return DASHBOARD_ROUTE_DEFS.find((d) => d.path === path)
}

function fourthTabDef(role: Role): DashboardRouteDef | undefined {
  if (role === 'admin') {
    const members = defForPath('team/members')
    if (members && routeDefAccessible(members, role)) return members
  }
  const followUps = defForPath('work/follow-ups')
  if (followUps && routeDefAccessible(followUps, role)) return followUps
  return undefined
}

type IndicatorState = { left: number; width: number; visible: boolean }

function getTabCenters(innerEl: HTMLElement): number[] {
  const tabs = innerEl.querySelectorAll<HTMLElement>('a')
  return Array.from(tabs).map((t) => t.offsetLeft + t.offsetWidth / 2)
}

function snapIndex(x: number, centers: number[]): number {
  let minDist = Infinity
  let idx = 0
  for (let i = 0; i < centers.length; i++) {
    const d = Math.abs(x - centers[i])
    if (d < minDist) { minDist = d; idx = i }
  }
  return idx
}

const BLOB_MIN = 38
const BLOB_MAX = 56

function morphWidth(x: number, centers: number[]): number {
  let minDist = Infinity
  for (const c of centers) {
    const d = Math.abs(x - c)
    if (d < minDist) minDist = d
  }
  const t = Math.min(minDist / 40, 1)
  return BLOB_MIN + (BLOB_MAX - BLOB_MIN) * t
}

export function DashboardMobileTabBar({
  role,
  trainingLocked = false,
  onOpenMenu,
  keyboardOpen = false,
  scrolled = false,
}: Props) {
  const location = useLocation()
  const navigate = useNavigate()
  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([])
  const innerRef = useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = useState<IndicatorState>({ left: 0, width: 46, visible: false })
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef({ startX: 0, currentX: 0, activeIdx: 0 })

  const fourth = fourthTabDef(role)
  const defs: DashboardRouteDef[] = [
    ...TAB_ORDER.map((p) => defForPath(p)).filter(
      (d): d is DashboardRouteDef => d != null,
    ),
    fourth,
  ].filter((d): d is DashboardRouteDef => d != null && routeDefAccessible(d, role))

  const tos = defs.map((def) =>
    def.path === '' ? '/dashboard' : `/dashboard/${def.path}`,
  )
  const activeIndex = tos.findIndex((to, i) =>
    defs[i].path === ''
      ? location.pathname === '/dashboard'
      : location.pathname === to || location.pathname.startsWith(`${to}/`),
  )

  // Measure the active tab so the liquid-glass indicator can slide to it.
  useLayoutEffect(() => {
    if (isDragging) return
    const el = activeIndex >= 0 ? tabRefs.current[activeIndex] : null
    if (!el) {
      setIndicator((s) => ({ ...s, visible: false }))
      return
    }
    const centers = getTabCenters(innerRef.current!)
    const cx = el.offsetLeft + el.offsetWidth / 2
    const w = morphWidth(cx, centers)
    setIndicator({
      left: cx - w / 2,
      width: w,
      visible: true,
    })
  }, [activeIndex, defs.length, scrolled, keyboardOpen, isDragging])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!innerRef.current) return
    const rect = innerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    dragRef.current = { startX: x, currentX: x, activeIdx: activeIndex >= 0 ? activeIndex : 0 }
    setIsDragging(true)
    innerRef.current.setPointerCapture(e.pointerId)
  }, [activeIndex])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging || !innerRef.current) return
    const rect = innerRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
    dragRef.current.currentX = x
    const centers = getTabCenters(innerRef.current)
    if (centers.length === 0) return
    const w = morphWidth(x, centers)
    setIndicator({ left: x - w / 2, width: w, visible: true })
  }, [isDragging])

  const handlePointerUp = useCallback(() => {
    if (!isDragging || !innerRef.current) return
    const centers = getTabCenters(innerRef.current)
    if (centers.length === 0) { setIsDragging(false); return }
    const dx = Math.abs(dragRef.current.currentX - dragRef.current.startX)
    const idx = snapIndex(dragRef.current.currentX, centers)
    // Snap indicator to nearest tab (spring transition re-enables via CSS)
    const cx = centers[idx]
    const w = morphWidth(cx, centers)
    setIndicator({
      left: cx - w / 2,
      width: w,
      visible: true,
    })
    setIsDragging(false)
    // Only navigate on actual drag (>10px) — taps let NavLink handle naturally
    if (dx > 10) {
      const to = tos[idx]
      if (to && location.pathname !== to && !location.pathname.startsWith(`${to}/`)) {
        navigate(to)
      }
    }
  }, [isDragging, tos, location.pathname, navigate])

  const barClass = cn(
    'dashboard-mobile-tabbar shrink-0 pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)] md:hidden',
    keyboardOpen && 'dashboard-mobile-tabbar--keyboard-open',
    scrolled && 'dashboard-mobile-tabbar--scrolled',
  )
  const innerClass =
    'dashboard-mobile-tabbar__inner mx-auto flex h-[60px] max-w-lg items-stretch justify-around gap-1 px-1.5 min-[390px]:px-2'
  const tabClass =
    'dashboard-mobile-tabbar__tab flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[1rem] px-1 py-1 text-ds-label font-medium transition-colors active:opacity-70'
  const iconClass = 'size-[22px] shrink-0 min-[390px]:size-6'

  if (trainingLocked) {
    const def = defForPath('system/training')
    if (!def || !routeDefAccessible(def, role)) return null
    const Icon = getDashboardNavIcon('system/training')
    const label =
      resolveTitleForPath('system/training', role) ?? def.label
    return (
      <nav
        className={barClass}
        role="navigation"
        aria-label="Training"
      >
        <div className={innerClass}>
          <NavLink
            to="/dashboard/system/training"
            className={({ isActive }) =>
              cn(
                tabClass,
                isActive
                  ? 'dashboard-mobile-tabbar__tab--active text-primary'
                  : 'dashboard-mobile-tabbar__tab--idle text-muted-foreground hover:text-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={cn(
                    iconClass,
                    isActive ? 'text-primary' : 'text-muted-foreground',
                  )}
                  strokeWidth={isActive ? 2.25 : 1.75}
                  aria-hidden
                />
                <span className="truncate">{label}</span>
              </>
            )}
          </NavLink>
          <button
            type="button"
            onClick={onOpenMenu}
            className={cn(
              tabClass,
              'dashboard-mobile-tabbar__tab--idle text-muted-foreground hover:text-foreground',
            )}
            aria-label="Open menu"
          >
            <MoreHorizontal className={iconClass} strokeWidth={1.75} aria-hidden />
            <span className="truncate">Menu</span>
          </button>
        </div>
      </nav>
    )
  }

  return (
    <nav
      className={barClass}
      role="navigation"
      aria-label="Main tabs"
    >
      <div
        className={innerClass}
        ref={innerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ touchAction: 'none' }}
      >
        {/* Liquid-glass sliding indicator — springs to the active tab */}
        <span
          aria-hidden
          className={cn(
            'dashboard-mobile-tabbar__indicator',
            isDragging && 'dashboard-mobile-tabbar__indicator--dragging',
          )}
          style={{
            transform: `translateX(${indicator.left}px)`,
            width: indicator.width,
            opacity: indicator.visible ? 1 : 0,
          }}
        />
        {defs.map((def, i) => {
          const to = tos[i]
          const Icon = getDashboardNavIcon(def.path)
          const label =
            SHORT_LABEL[def.path] ??
            resolveTitleForPath(def.path, role) ??
            def.label
          return (
            <NavLink
              key={def.path || 'home'}
              to={to}
              end={def.end ?? false}
              ref={(el) => {
                tabRefs.current[i] = el
              }}
              className={({ isActive }) =>
                cn(
                  tabClass,
                  isActive
                    ? 'dashboard-mobile-tabbar__tab--active text-primary'
                    : 'dashboard-mobile-tabbar__tab--idle text-muted-foreground hover:text-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn(
                      iconClass,
                      isActive ? 'text-primary' : 'text-muted-foreground',
                    )}
                    strokeWidth={isActive ? 2.25 : 1.75}
                    aria-hidden
                  />
                  <span className="truncate">{label}</span>
                </>
              )}
            </NavLink>
          )
        })}

        <button
          type="button"
          onClick={onOpenMenu}
          className={cn(
            tabClass,
            'dashboard-mobile-tabbar__tab--idle text-muted-foreground hover:text-foreground',
          )}
          aria-label="Open full menu"
        >
          <MoreHorizontal className={iconClass} strokeWidth={1.75} aria-hidden />
          <span className="truncate">More</span>
        </button>
      </div>
    </nav>
  )
}
