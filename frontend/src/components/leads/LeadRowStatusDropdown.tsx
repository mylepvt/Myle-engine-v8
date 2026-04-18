import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'

import {
  LEAD_STATUS_GROUPS,
  LEAD_STATUS_OPTIONS,
  type LeadStatus,
} from '@/hooks/use-leads-query'
import { cn } from '@/lib/utils'

type Props = {
  leadName: string
  status: string
  disabled?: boolean
  busy?: boolean
  onSelect: (next: LeadStatus) => void
}

export const LeadRowStatusDropdown = memo(function LeadRowStatusDropdown({
  leadName,
  status,
  disabled,
  busy,
  onSelect,
}: Props) {
  const [open, setOpen] = useState(false)
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const uid = useId()
  const listboxId = `${uid}-listbox`

  const currentLabel =
    LEAD_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status

  const allOptions = useMemo(
    () =>
      LEAD_STATUS_GROUPS.flatMap((g) =>
        g.statuses.flatMap((v) => {
          const o = LEAD_STATUS_OPTIONS.find((x) => x.value === v)
          return o ? [o] : []
        }),
      ),
    [],
  )

  const close = useCallback(() => setOpen(false), [])

  const pick = useCallback(
    (v: LeadStatus) => {
      close()
      if (v !== status) onSelect(v)
    },
    [close, onSelect, status],
  )

  useEffect(() => {
    if (open) {
      const idx = allOptions.findIndex((o) => o.value === status)
      setFocusedIdx(idx >= 0 ? idx : 0)
    } else {
      setFocusedIdx(-1)
    }
  }, [open, status, allOptions])

  useLayoutEffect(() => {
    if (!open || typeof document === 'undefined') return
    const btn = btnRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    const el = menuRef.current
    if (!el) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const menuW = Math.min(280, vw - 8)
    let left = rect.left
    if (left + menuW > vw - 4) left = Math.max(4, vw - menuW - 4)
    let top = rect.bottom + 4
    const estH = 320
    if (top + estH > vh - 4) top = Math.max(4, rect.top - estH - 4)
    el.style.left = `${left}px`
    el.style.top = `${top}px`
    el.style.width = `${menuW}px`
  }, [open])

  const focusedIdxRef = useRef(focusedIdx)
  useEffect(() => { focusedIdxRef.current = focusedIdx }, [focusedIdx])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); return }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedIdx((i) => (i + 1) % allOptions.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedIdx((i) => (i - 1 + allOptions.length) % allOptions.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const opt = allOptions[focusedIdxRef.current]
        if (opt) pick(opt.value)
      }
    }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return
      close()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, close, allOptions, pick])

  const menu =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            aria-label={`Status for ${leadName}`}
            aria-activedescendant={focusedIdx >= 0 ? `${uid}-opt-${focusedIdx}` : undefined}
            className={cn(
              'fixed z-[100] max-h-[min(70vh,22rem)] overflow-y-auto overflow-x-hidden rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-lg',
            )}
          >
            {LEAD_STATUS_GROUPS.map((g) => (
              <div key={g.label} className="px-1 py-0.5">
                <p className="px-2 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">
                  {g.label}
                </p>
                {g.statuses.map((value) => {
                  const o = LEAD_STATUS_OPTIONS.find((x) => x.value === value)
                  if (!o) return null
                  const active = o.value === status
                  const optIdx = allOptions.findIndex((x) => x.value === o.value)
                  const focused = optIdx === focusedIdx
                  return (
                    <button
                      key={o.value}
                      id={`${uid}-opt-${optIdx}`}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={cn(
                        'flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                        active ? 'bg-primary/15 font-semibold text-primary' : 'hover:bg-muted/80',
                        focused && !active && 'bg-muted/80 ring-1 ring-inset ring-primary/30',
                      )}
                      onClick={() => pick(o.value)}
                    >
                      {o.label}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>,
          document.body,
        )
      : null

  return (
    <div className="relative min-w-0">
      <button
        ref={btnRef}
        type="button"
        id={`${uid}-trigger`}
        data-ui-silent
        disabled={disabled || busy}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={`Stage for ${leadName}`}
        onClick={() => {
          if (disabled || busy) return
          setOpen((o) => !o)
        }}
        className={cn(
          'flex h-8 w-full max-w-full items-center justify-between gap-1 rounded-md border border-white/12 bg-white/[0.05] px-2 text-left text-xs text-foreground shadow-glass-inset',
          'focus:outline-none focus:ring-2 focus:ring-primary/35',
          (disabled || busy) && 'cursor-not-allowed opacity-60',
        )}
      >
        <span className="min-w-0 flex-1 truncate">{currentLabel}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-60" aria-hidden />
      </button>
      {menu}
    </div>
  )
})
