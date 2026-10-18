/**
 * iOS Safari 16.4+ Audio Session API (`navigator.audioSession`).
 *
 * The app's UI sounds set the session to 'ambient' so taps mix with the user's music. But in
 * 'ambient' Safari refuses microphone capture ("AudioSession category is not compatible with
 * audio capture" → InvalidStateError) and the ring/silent switch mutes playback. Voice notes
 * switch the session for as long as they need it and then put it back.
 */
export type AudioSessionType = 'auto' | 'playback' | 'transient' | 'transient-solo' | 'ambient' | 'play-and-record'

type AudioSessionLike = { type: string }

function audioSession(): AudioSessionLike | null {
  if (typeof navigator === 'undefined') return null
  const session = (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession
  return session && typeof session.type === 'string' ? session : null
}

/** Switch the page's audio session; returns a function that restores the previous type. */
export function switchAudioSession(type: AudioSessionType): () => void {
  const session = audioSession()
  if (!session) return () => undefined
  const previous = session.type
  try {
    session.type = type
  } catch {
    return () => undefined
  }
  return () => {
    try {
      // Only restore if nothing else changed it in the meantime.
      if (session.type === type) session.type = previous
    } catch {
      /* not supported */
    }
  }
}
