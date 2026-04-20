export type SearchableValue = string | number | null | undefined

export type DirectorySearchableRecord = {
  fbo_id?: string | null
  name?: string | null
  username?: string | null
  email?: string | null
  phone?: string | null
  role?: string | null
  upline_name?: string | null
  upline_fbo_id?: string | null
  training_status?: string | null
}

function normalizeSearchValue(value: SearchableValue): string {
  return String(value ?? '').trim().toLowerCase()
}

export function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase()
}

function matchesSearchNeedle(values: SearchableValue[], needle: string): boolean {
  return values.some((value) => normalizeSearchValue(value).includes(needle))
}

export function matchesSearchQuery(values: SearchableValue[], query: string): boolean {
  const needle = normalizeSearchQuery(query)
  if (!needle) return true
  return matchesSearchNeedle(values, needle)
}

export function filterCollectionByQuery<T>(
  items: T[],
  query: string,
  getValues: (item: T) => SearchableValue[],
): T[] {
  const needle = normalizeSearchQuery(query)
  if (!needle) return items
  return items.filter((item) => matchesSearchNeedle(getValues(item), needle))
}

export function directorySearchValues(record: DirectorySearchableRecord): SearchableValue[] {
  return [
    record.fbo_id,
    record.name,
    record.username,
    record.email,
    record.phone,
    record.role,
    record.upline_name,
    record.upline_fbo_id,
    record.training_status,
  ]
}
