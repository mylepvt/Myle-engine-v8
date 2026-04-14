import { useCallback } from 'react'

import { playSnd01SineTap, shouldEnableSnd01SineUiSound } from '@/lib/snd01-sine-ui-sound'

export function useSnd01SineUiSound() {
  const playTap = useCallback(() => {
    playSnd01SineTap()
  }, [])

  return {
    playTap,
    /** Snapshot for UI hints; re-render to refresh if OS settings change. */
    enabled: shouldEnableSnd01SineUiSound(),
  }
}
