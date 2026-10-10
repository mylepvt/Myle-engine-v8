import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

import { useMyRewardsQuery } from './use-rewards-query'
import { useXpMeQuery } from './use-xp-query'
import { haptic, playAppSound } from '@/lib/app-sounds'
import { emitXpFly } from '@/lib/xp-fly'

/** Sound + "+25 MP" burst when MYLE Points arrive, a toast on level up, a flame on the work streak. */
export function useRewardSound() {
  const { data: rewards } = useMyRewardsQuery()
  const { data: work } = useXpMeQuery() // work streak only
  const prevMp = useRef(rewards)
  const prevStreak = useRef(work?.streak)

  useEffect(() => {
    const p = prevMp.current
    prevMp.current = rewards
    if (!rewards?.eligible || !p?.eligible) return
    const gained = rewards.points_total - p.points_total
    if (gained <= 0) return
    const levelUp = Boolean(rewards.level && p.level && rewards.level.key !== p.level.key)
    playAppSound(levelUp ? 'level_up' : 'reward')
    haptic(levelUp ? [30, 40, 30, 40, 120] : [12, 30, 18])
    emitXpFly({ amount: gained, levelUp })
    if (levelUp && rewards.level) {
      toast.success(`Level up! You're now ${rewards.level.label}.`, {
        description: `${rewards.level.mp.toLocaleString('en-IN')} MYLE Points. Keep going.`,
      })
    }
  }, [rewards])

  useEffect(() => {
    const before = prevStreak.current
    prevStreak.current = work?.streak
    if (!work || before == null) return
    // The call that hits today's target extends the work streak: flame burst.
    if (work.streak_done_today && work.streak > before) {
      playAppSound('reward')
      emitXpFly({ amount: 0, streak: work.streak })
    }
  }, [work])
}
