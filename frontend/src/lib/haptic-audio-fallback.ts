import { browserSupportsVibration } from '@/lib/haptics'

/**
 * iPhone Safari has no Web Vibration API. When haptics are "on" but sound is off,
 * give a barely audible tick so feedback isn't completely absent.
 */
export async function iosNoVibrateAudioFallback(
  hapticsEnabled: boolean,
  soundEnabled: boolean,
  playTick: () => void | Promise<void>,
): Promise<void> {
  if (!hapticsEnabled || soundEnabled) return
  if (browserSupportsVibration()) return
  await playTick()
}
