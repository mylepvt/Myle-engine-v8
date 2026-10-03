import { useEffect, useRef } from 'react'
import { useXpMeQuery } from './use-xp-query'
import { toast } from 'sonner'

import { playAppSound } from '@/lib/app-sounds'
import { emitXpFly } from '@/lib/xp-fly'

export function useXpRewardSound() {
  const { data } = useXpMeQuery()
  const prev = useRef(data)

  useEffect(() => {
    if (!data || !prev.current) {
      prev.current = data
      return
    }

    const p = prev.current

    const levelUp = data.level !== p.level
    const xpGained = data.xp_total > p.xp_total
    const streakMilestone = data.streak >= 2 && data.streak % 5 === 0 && data.streak > (p.streak ?? 0)

    if (levelUp || xpGained || streakMilestone) {
      playAppSound('reward')
    }
    // Make the reward visible, not just audible: icons + "+8 XP" float up
    // from where the user tapped (Instagram-heart style).
    if (xpGained) emitXpFly({ amount: data.xp_total - p.xp_total, levelUp })
    if (levelUp) {
      toast.success(`Level up! You're now ${data.level_label}.`, {
        description: `${data.xp_total} XP this season. Keep going.`,
      })
    }

    prev.current = data
  }, [data])
}
