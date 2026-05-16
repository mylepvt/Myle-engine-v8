import { create } from 'zustand'

export type LiveDashboardState = {
  callsToday: number
  day1Total: number
  day2Total: number
  day3Total: number
  day4Total: number
  day5Total: number
  claimedToday: number
  approvedToday: number
  newLeadsToday: number
  enrolledToday: number
  walletCreditsToday: number
  latestTransition: { from: string; to: string; leadName: string; timestamp: number } | null
  latestClaim: { actorName: string; count: number; timestamp: number } | null
  processEvent: (action: string, metadata?: Record<string, unknown>) => void
  resetDaily: () => void
  setInitial: (data: Partial<Omit<LiveDashboardState, 'processEvent' | 'resetDaily' | 'setInitial'>>) => void
}

const DAILY_RESET_KEY = 'live-dashboard-date'

function getTodayDate() {
  const d = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage ?? null
  } catch {
    return null
  }
}

function checkDailyReset() {
  const storage = getStorage()
  if (!storage) return false
  const stored = storage.getItem(DAILY_RESET_KEY)
  const today = getTodayDate()
  if (stored !== today) {
    storage.setItem(DAILY_RESET_KEY, today)
    return true
  }
  return false
}

export const useLiveDashboardStore = create<LiveDashboardState>(() => {
  if (checkDailyReset()) {
    return {
      callsToday: 0, day1Total: 0, day2Total: 0, day3Total: 0, day4Total: 0, day5Total: 0,
      claimedToday: 0, approvedToday: 0, newLeadsToday: 0, enrolledToday: 0, walletCreditsToday: 0,
      latestTransition: null, latestClaim: null,
      processEvent: () => {},
      resetDaily: () => {},
      setInitial: () => {},
    }
  }
  return {
    callsToday: 0, day1Total: 0, day2Total: 0, day3Total: 0, day4Total: 0, day5Total: 0,
    claimedToday: 0, approvedToday: 0, newLeadsToday: 0, enrolledToday: 0, walletCreditsToday: 0,
    latestTransition: null, latestClaim: null,
    processEvent: () => {},
    resetDaily: () => {},
    setInitial: () => {},
  }
})

const update = useLiveDashboardStore.setState

useLiveDashboardStore.setState({
  processEvent: (action, metadata) => {
    if (action === 'lead:created') {
      update((s) => ({ newLeadsToday: s.newLeadsToday + 1 }))
      return
    }

    if (action === 'lead:transitioned' || action === 'lead_state') {
      const stage = String(metadata?.stage ?? metadata?.fastapi_stage ?? '')
      const leadName = String(metadata?.lead_name ?? '')
      const leadId = String(metadata?.lead_id ?? '')
      const ref = leadName || (leadId ? `Lead #${leadId}` : '')
      if (stage === 'day1') update((s) => ({ day1Total: s.day1Total + 1, latestTransition: { from: '', to: 'day1', leadName: ref, timestamp: Date.now() } }))
      else if (stage === 'day2') update((s) => ({ day2Total: s.day2Total + 1 }))
      else if (stage === 'day3') update((s) => ({ day3Total: s.day3Total + 1 }))
      else if (stage === 'day4') update((s) => ({ day4Total: s.day4Total + 1 }))
      else if (stage === 'day5') update((s) => ({ day5Total: s.day5Total + 1 }))
      else if (stage === 'converted' || stage === 'enrolled') update((s) => ({ enrolledToday: s.enrolledToday + 1 }))
      return
    }

    if (action === 'lead:claimed' || action === 'lead:batch_claimed') {
      const actorName = String(metadata?.actor_name ?? '')
      update((s) => ({
        claimedToday: s.claimedToday + 1,
        latestClaim: { actorName, count: 1, timestamp: Date.now() },
      }))
      return
    }

    if (action.startsWith('wallet:')) {
      update((s) => ({ walletCreditsToday: s.walletCreditsToday + 1 }))
      return
    }

    if (action === 'lead:closed') {
      update((s) => ({ enrolledToday: s.enrolledToday + 1 }))
      return
    }
  },

  resetDaily: () => {
    getStorage()?.setItem(DAILY_RESET_KEY, getTodayDate())
    update({
      callsToday: 0, day1Total: 0, day2Total: 0, day3Total: 0, day4Total: 0, day5Total: 0,
      claimedToday: 0, approvedToday: 0, newLeadsToday: 0, enrolledToday: 0, walletCreditsToday: 0,
    })
  },

  setInitial: (data) => {
    update(data)
  },
})
