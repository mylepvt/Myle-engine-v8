import { Check, ChevronLeft, ChevronRight, SkipForward, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface OnboardingStep {
  id: string
  title: string
  description: string
  selector?: string
  placement?: 'bottom' | 'top' | 'left' | 'right'
  icon?: string
}

interface OnboardingTourProps {
  steps: OnboardingStep[]
  onNext: () => void
  onSkip: () => void
  onDone: () => void
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const handler = (event: MediaQueryListEvent) => setReduced(event.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return reduced
}

export function OnboardingTour({ steps, onNext, onSkip, onDone }: OnboardingTourProps) {
  const [current, setCurrent] = useState(0)
  const reduced = useReducedMotion()
  const cardRef = useRef<HTMLDivElement>(null)
  const total = steps.length
  const step = steps[current]
  const isLast = current === total - 1

  const handleNext = useCallback(() => {
    if (isLast) {
      onDone()
    } else {
      setCurrent((c) => c + 1)
    }
  }, [isLast, onDone])

  const handlePrev = useCallback(() => {
    setCurrent((c) => Math.max(c - 1, 0))
  }, [])

  const handleSkip = useCallback(() => {
    onSkip()
  }, [onSkip])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleSkip()
      if (e.key === 'ArrowRight' || e.key === 'Enter') handleNext()
      if (e.key === 'ArrowLeft') handlePrev()
    },
    [handleNext, handlePrev, handleSkip],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  useEffect(() => {
    if (!step.selector) return
    const el = document.querySelector(step.selector)
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
    }
  }, [current, step.selector, reduced])

  const cardStyle = useMemo(() => {
    if (!step.selector) return {}
    return getTooltipPosition(step.selector, step.placement ?? 'bottom')
  }, [current, step.selector, step.placement])

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/50" />

      {step.selector ? (
        <>
          <div className="absolute inset-0 overflow-hidden">
            <SpotlightCutout selector={step.selector} />
          </div>
          <div
            ref={cardRef}
            className={cn(
              'absolute z-10 w-80 rounded-xl border border-border/60 bg-card p-5 shadow-2xl',
              !reduced && 'animate-slide-up',
            )}
            style={cardStyle}
          >
            <StepCardContent
              step={step}
              current={current}
              total={total}
              isLast={isLast}
              onNext={handleNext}
              onPrev={handlePrev}
              onSkip={handleSkip}
            />
          </div>
        </>
      ) : (
        <div className="flex h-full items-center justify-center p-4">
          <div
            ref={cardRef}
            className={cn(
              'w-full max-w-md rounded-xl border border-border/60 bg-card p-6 shadow-2xl',
              !reduced && 'animate-slide-up',
            )}
          >
            <StepCardContent
              step={step}
              current={current}
              total={total}
              isLast={isLast}
              onNext={handleNext}
              onPrev={handlePrev}
              centered
              onSkip={handleSkip}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function SpotlightCutout({ selector }: { selector: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    const update = () => {
      const el = document.querySelector(selector)
      if (el) setRect(el.getBoundingClientRect())
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, { passive: true })
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update)
    }
  }, [selector])

  if (!rect) return null

  const pad = 8
  return (
    <svg className="absolute inset-0 h-full w-full" style={{ pointerEvents: 'none' }}>
      <defs>
        <mask id="spotlight-mask">
          <rect width="100%" height="100%" fill="white" />
          <rect
            x={rect.left - pad}
            y={rect.top - pad}
            width={rect.width + pad * 2}
            height={rect.height + pad * 2}
            fill="black"
            rx={12}
          />
        </mask>
      </defs>
      <rect
        width="100%"
        height="100%"
        fill="rgba(0,0,0,0.5)"
        mask="url(#spotlight-mask)"
      />
    </svg>
  )
}

function StepCardContent({
  step,
  current,
  total,
  isLast,
  centered,
  onNext,
  onPrev,
  onSkip,
}: {
  step: OnboardingStep
  current: number
  total: number
  isLast: boolean
  centered?: boolean
  onNext: () => void
  onPrev: () => void
  onSkip: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          {step.icon ? (
            <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-lg">
              {step.icon}
            </span>
          ) : null}
          <div>
            <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.description}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSkip}
          className="shrink-0 rounded-md p-1 text-muted-foreground/50 transition hover:bg-muted hover:text-muted-foreground"
          aria-label="Skip tutorial"
          tabIndex={0}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center justify-center gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 rounded-full transition-all duration-300',
              i === current
                ? 'w-6 bg-primary'
                : i < current
                  ? 'w-1.5 bg-primary/40'
                  : 'w-1.5 bg-muted-foreground/20',
            )}
          />
        ))}
      </div>

      <div className={cn('flex items-center gap-2', centered ? 'justify-center' : 'justify-between')}>
        <Button type="button" variant="ghost" size="sm" onClick={onPrev} disabled={current === 0} className="text-xs">
          <ChevronLeft className="mr-1 h-3.5 w-3.5" />
          Back
        </Button>

        <Button type="button" variant="ghost" size="sm" onClick={onSkip} className="text-xs text-muted-foreground">
          <SkipForward className="mr-1 h-3.5 w-3.5" />
          Skip
        </Button>

        <Button type="button" size="sm" onClick={onNext} className="text-xs">
          {isLast ? (
            <>
              <Check className="mr-1 h-3.5 w-3.5" />
              Done
            </>
          ) : (
            <>
              Next
              <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

function getTooltipPosition(
  selector: string,
  placement: 'bottom' | 'top' | 'left' | 'right',
  margin = 12,
): React.CSSProperties {
  const el = document.querySelector(selector)
  if (!el) return { visibility: 'hidden' as const }
  const rect = el.getBoundingClientRect()
  const vw = window.innerWidth
  const cardW = 320

  let left: number
  let top: number

  switch (placement) {
    case 'bottom':
      left = rect.left + rect.width / 2 - cardW / 2
      top = rect.bottom + margin
      break
    case 'top':
      left = rect.left + rect.width / 2 - cardW / 2
      top = rect.top - margin
      break
    case 'left':
      left = rect.left - cardW - margin
      top = rect.top + rect.height / 2
      break
    case 'right':
      left = rect.right + margin
      top = rect.top + rect.height / 2
      break
  }

  left = Math.max(margin, Math.min(left, vw - cardW - margin))
  top = Math.max(margin, Math.min(top, window.innerHeight - 200))

  return { left, top }
}
