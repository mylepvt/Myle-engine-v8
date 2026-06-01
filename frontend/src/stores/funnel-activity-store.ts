import { create } from 'zustand'

export type ActorDot = {
  id: string
  name: string
  color: string
  stage: string
  stageLabel: string
  lastSeen: number
  action: string
}

export type FunnelStage = {
  key: string
  label: string
  icon: string
  dots: ActorDot[]
  count: number
}

const FUNNEL_STAGES: { key: string; label: string; icon: string }[] = [
  { key: 'claimed', label: 'Just Claimed', icon: '⚑' },
  { key: 'new_lead', label: 'New Lead', icon: '📥' },
  { key: 'contacted', label: 'Contacted', icon: '📞' },
  { key: 'invited', label: 'Invited', icon: '✉️' },
  { key: 'video_sent', label: 'Enrollment Live', icon: '▶️' },
  { key: 'video_watched', label: 'Video Watched', icon: '👀' },
  { key: 'day1', label: 'Day 1', icon: '🎯' },
  { key: 'day2', label: 'Day 2', icon: '📚' },
  { key: 'day3', label: 'Day 3', icon: '📚' },
  { key: 'converted', label: 'Converted', icon: '🏆' },
]

const DOT_COLORS = [
  '#5865f2', '#eb459e', '#3ba55c', '#f0b232',
  '#9b59b6', '#1abc9c', '#e67e22', '#3498db',
  '#2ecc71', '#e74c3c', '#95a5a6', '#f39c12',
]

const STAGE_MAP: Record<string, string> = {
  'lead:created': 'new_lead',
  'lead:transitioned': '',  // determined by metadata
  'lead_state': '',         // determined by metadata
  'lead:claimed': 'claimed',
  'lead:batch_claimed': 'claimed',
  'lead:closed': 'converted',
}

const STAGE_LABEL: Record<string, string> = {
  'lead:created': 'added a lead',
  'lead:transitioned': 'moved to',
  'lead_state': 'moved to',
  'lead:claimed': 'claimed leads',
  'lead:batch_claimed': 'batch claimed',
  'lead:closed': 'closed a lead',
  'wallet:credited': 'credited wallet',
  'wallet:credited_worker': 'credited wallet',
}

function actorColor(actorId: string): string {
  let hash = 0
  for (let i = 0; i < actorId.length; i++) {
    hash = actorId.charCodeAt(i) + ((hash << 5) - hash)
  }
  return DOT_COLORS[Math.abs(hash) % DOT_COLORS.length]
}

const DOT_TTL = 120_000 // 2 minutes — dot disappears if inactive

type FunnelState = {
  actors: Map<string, ActorDot>
  stages: string[]
  _tick: number
  getStages: () => FunnelStage[]
  processAction: (actorId: string, actorName: string, action: string, stage?: string) => void
  cleanup: () => void
}

export const useFunnelActivityStore = create<FunnelState>((set, get) => {
  return {
    actors: new Map(),
    stages: FUNNEL_STAGES.map((s) => s.key),
    _tick: 0,

    getStages: () => {
      const { actors } = get()
      const now = Date.now()
      return FUNNEL_STAGES.map((s) => {
        const stageDots: ActorDot[] = []
        for (const entry of actors) {
          const dot = entry[1]
          if (now - dot.lastSeen > DOT_TTL) continue
          if (dot.stage === s.key) {
            stageDots.push(dot)
          }
        }
        return { ...s, dots: stageDots, count: stageDots.length }
      })
    },

    processAction: (actorId, actorName, action, stage) => {
      if (!actorId) return
      const color = actorColor(actorId)
      // Normalize legacy "new" alias → "new_lead"
      const normalizedStage = stage === 'new' ? 'new_lead' : stage
      let targetStage = STAGE_MAP[action] || normalizedStage || 'new_lead'

      if ((action === 'lead:transitioned' || action === 'lead_state') && normalizedStage) {
        targetStage = normalizedStage
      }

      set((s) => {
        const next = new Map(s.actors)
        next.set(actorId, {
          id: actorId,
          name: actorName,
          color,
          stage: targetStage,
          stageLabel: STAGE_LABEL[action] || action,
          lastSeen: Date.now(),
          action,
        })
        return { actors: next, _tick: s._tick + 1 }
      })
    },

    cleanup: () => {
      const now = Date.now()
      set((s) => {
        const next = new Map(s.actors)
        for (const entry of next) {
          const dot = entry[1]
          if (now - dot.lastSeen > DOT_TTL) next.delete(entry[0])
        }
        return { actors: next, _tick: s._tick + 1 }
      })
    },
  }
});

// Auto-cleanup every 30 seconds
if (typeof window !== 'undefined') {
  setInterval(() => {
    useFunnelActivityStore.getState().cleanup()
  }, 30_000)
}
