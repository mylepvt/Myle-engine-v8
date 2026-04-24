export type LeadSlaTone = {
  text: string
  stroke: string
  glow: string
  border: string
  cardGlow: string
  leftBorder: string
}

export const LEAD_SLA_SMOOTH_REFRESH_MS = 100

export type LeadSlaClockAngles = {
  hourAngle: number
  minuteAngle: number
  secondAngle: number
}

export function leadSlaTone(totalSeconds: number): LeadSlaTone {
  const hours = totalSeconds / 3600

  if (hours >= 24) {
    return {
      text: 'text-emerald-800 dark:text-urgency-safe',
      stroke: 'var(--urgency-safe)',
      glow: 'shadow-urgency-safe',
      border: 'border-urgency-safe/25',
      cardGlow: 'shadow-urgency-safe-card',
      leftBorder: 'bg-urgency-safe shadow-urgency-safe',
    }
  }
  if (hours >= 18) {
    return {
      text: 'text-blue-700 dark:text-urgency-watch',
      stroke: 'var(--urgency-watch)',
      glow: 'shadow-urgency-watch',
      border: 'border-urgency-watch/25',
      cardGlow: 'shadow-urgency-watch-card',
      leftBorder: 'bg-urgency-watch shadow-urgency-watch',
    }
  }
  if (hours >= 12) {
    return {
      text: 'text-orange-700 dark:text-urgency-caution',
      stroke: 'var(--urgency-caution)',
      glow: 'shadow-urgency-caution',
      border: 'border-urgency-caution/25',
      cardGlow: 'shadow-urgency-caution-card',
      leftBorder: 'bg-urgency-caution shadow-urgency-caution',
    }
  }
  if (hours >= 6) {
    return {
      text: 'text-red-700 dark:text-urgency-warning',
      stroke: 'var(--urgency-warning)',
      glow: 'shadow-urgency-warning',
      border: 'border-urgency-warning/25',
      cardGlow: 'shadow-urgency-warning-card',
      leftBorder: 'bg-urgency-warning shadow-urgency-warning',
    }
  }
  if (hours >= 2) {
    return {
      text: 'text-red-800 dark:text-urgency-danger',
      stroke: 'var(--urgency-danger)',
      glow: 'shadow-urgency-danger',
      border: 'border-urgency-danger/30',
      cardGlow: 'shadow-urgency-danger-card',
      leftBorder: 'bg-urgency-danger shadow-urgency-danger',
    }
  }
  return {
    text: 'text-red-900 dark:text-urgency-critical',
    stroke: 'var(--urgency-critical)',
    glow: 'shadow-urgency-critical',
    border: 'border-urgency-critical/40',
    cardGlow: 'shadow-urgency-critical-card',
    leftBorder: 'bg-urgency-critical shadow-urgency-critical',
  }
}

export function leadSlaClockAngles(totalMs: number): LeadSlaClockAngles {
  const totalSeconds = Math.max(0, totalMs) / 1000
  return {
    hourAngle: ((totalSeconds / 3600) % 12) * 30,
    minuteAngle: ((totalSeconds / 60) % 60) * 6,
    secondAngle: (totalSeconds % 60) * 6,
  }
}

export function formatLeadSlaTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}
