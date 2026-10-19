import { useState } from 'react'

/**
 * The value, or the last non-null one it had. Lets a modal driven by a
 * nullable target keep rendering its content while it animates out after the
 * target is cleared.
 */
export function useLatestValue<T>(value: T | null | undefined): T | null {
  const [last, setLast] = useState<T | null>(value ?? null)
  if (value != null && value !== last) setLast(value)
  return value ?? last
}
