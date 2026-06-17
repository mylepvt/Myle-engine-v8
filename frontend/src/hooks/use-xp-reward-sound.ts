import { useEffect, useRef } from 'react'
import { useXpMeQuery } from './use-xp-query'
import { playAppSound } from '@/lib/app-sounds'

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

    prev.current = data
  }, [data])
}
