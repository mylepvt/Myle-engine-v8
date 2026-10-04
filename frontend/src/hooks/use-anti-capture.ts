import { type RefObject, useEffect, useState } from 'react'

/**
 * Anti-capture for private prospect videos: black out + pause when the tab loses
 * focus / is hidden (screen recorders, app switching), wipe the clipboard on
 * PrintScreen, and block the context menu + save / print / devtools shortcuts.
 */
export function useAntiCapture(videoRef: RefObject<HTMLVideoElement | null>): boolean {
  const [obscured, setObscured] = useState(false)

  useEffect(() => {
    const hide = () => {
      setObscured(true)
      videoRef.current?.pause()
    }
    const show = () => setObscured(false)
    const onVis = () => (document.hidden ? hide() : show())
    window.addEventListener('blur', hide)
    window.addEventListener('focus', show)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('blur', hide)
      window.removeEventListener('focus', show)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [videoRef])

  useEffect(() => {
    const onCtx = (e: MouseEvent) => e.preventDefault()
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      const ctrl = e.ctrlKey || e.metaKey
      if (e.key === 'PrintScreen') {
        navigator.clipboard?.writeText('').catch(() => {})
        setObscured(true)
        window.setTimeout(() => setObscured(false), 1200)
        return
      }
      if (
        e.key === 'F12' ||
        (ctrl && ['s', 'p', 'u'].includes(k)) ||
        (ctrl && e.shiftKey && ['i', 'j', 'c'].includes(k))
      ) {
        e.preventDefault()
      }
    }
    document.addEventListener('contextmenu', onCtx)
    document.addEventListener('keydown', onKey)
    document.addEventListener('keyup', onKey)
    return () => {
      document.removeEventListener('contextmenu', onCtx)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('keyup', onKey)
    }
  }, [])

  return obscured
}
