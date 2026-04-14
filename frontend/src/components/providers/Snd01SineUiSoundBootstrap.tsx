import { useEffect } from 'react'

import { preloadSnd01SineKit, shouldEnableSnd01SineUiSound } from '@/lib/snd01-sine-ui-sound'

/**
 * Warm-loads the SND01 sine kit after mount so the first tap is not delayed.
 */
export function Snd01SineUiSoundBootstrap() {
  useEffect(() => {
    if (!shouldEnableSnd01SineUiSound()) return
    void preloadSnd01SineKit().catch(() => {
      /* non-fatal */
    })
  }, [])

  return null
}
