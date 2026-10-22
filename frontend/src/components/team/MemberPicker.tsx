import { useDeferredValue, useId, useMemo, useState } from 'react'

import { ListSearchInput } from '@/components/ui/list-search-input'
import { InlineEmpty } from '@/components/ui/states'
import { filterCollectionByQuery } from '@/lib/search-filter'
import { cn } from '@/lib/utils'

export type PickableMember = {
  id: number
  name: string
  fbo_id?: string | null
  /** Second line under the name, e.g. "team · under Asha". */
  detail?: string | null
  /** Extra text the search matches on (phone, email, upline…). */
  search?: (string | null | undefined)[]
}

type Props = {
  members: PickableMember[]
  value: string
  onChange: (id: string) => void
  loading?: boolean
  disabled?: boolean
  label?: string
  placeholder?: string
}

/**
 * Search-first member picker for lists of 50–500 people: type a name, FBO ID or phone,
 * tap the match. Replaces a plain dropdown nobody can scroll through.
 */
export function MemberPicker({
  members,
  value,
  onChange,
  loading = false,
  disabled = false,
  label = 'Member',
  placeholder = 'Search name, FBO ID or phone',
}: Props) {
  const listId = useId()
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)
  const selected = members.find((m) => String(m.id) === value) ?? null

  const sorted = useMemo(
    () => [...members].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [members],
  )
  const matches = filterCollectionByQuery(sorted, deferred, (m) => [m.name, m.fbo_id, m.detail, ...(m.search ?? [])])

  if (selected) {
    return (
      <div>
        <p className="mb-1 text-xs text-muted-foreground">{label}</p>
        <div className="surface-inset flex items-center justify-between gap-3 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{selected.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {[selected.fbo_id, selected.detail].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChange('')}
            disabled={disabled}
            className="press shrink-0 rounded-full px-3 py-1.5 text-sm font-medium text-primary hover:bg-muted disabled:opacity-50"
          >
            Change
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <label htmlFor={`${listId}-q`} className="block text-xs text-muted-foreground">
        {label}
      </label>
      <ListSearchInput
        id={`${listId}-q`}
        value={query}
        onValueChange={setQuery}
        placeholder={loading ? 'Loading members…' : placeholder}
        disabled={disabled || loading}
        aria-controls={listId}
        wrapperClassName="w-full"
      />
      {!loading ? (
        <p className="text-xs text-muted-foreground">
          {query.trim() ? `${matches.length} of ${members.length} match` : `${members.length} members`}
        </p>
      ) : null}
      {!loading && matches.length === 0 ? (
        <InlineEmpty>No one matches “{query.trim()}”.</InlineEmpty>
      ) : null}
      {!loading && matches.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="surface-inset max-h-64 divide-y divide-border/60 overflow-y-auto overscroll-contain"
        >
          {matches.map((m) => (
            <li key={m.id} role="option" aria-selected={false}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  onChange(String(m.id))
                  setQuery('')
                }}
                className={cn(
                  'press flex w-full items-center px-3 py-2.5 text-left',
                  'hover:bg-muted/60 focus-visible:bg-muted/60 disabled:opacity-50',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-foreground">{m.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[m.fbo_id, m.detail].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
