import type { ReactNode } from 'react'
import { LazyMotion, MotionConfig } from 'motion/react'

const loadFeatures = () => import('@/lib/motion-features').then((mod) => mod.default)

/**
 * App-wide motion setup. Components use `m.*` (not `motion.*`) so the engine
 * loads lazily; `strict` makes an accidental `motion.*` fail loudly in dev.
 * `reducedMotion="user"` turns transform/layout animation into instant
 * changes when the OS asks for reduced motion.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  )
}
