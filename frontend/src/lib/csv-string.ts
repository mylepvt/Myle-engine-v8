/** RFC 4180-style field escaping for a single CSV column. */
export function escapeCsvCell(value: string): string {
  const needsQuotes = /[",\n\r]/.test(value)
  const inner = value.replace(/"/g, '""')
  return needsQuotes ? `"${inner}"` : inner
}

/** Build a CSV document with a header row; each row is already plain cell strings. */
export function buildCsv(headers: string[], rows: string[][]): string {
  const head = headers.map(escapeCsvCell).join(',')
  const body = rows.map((r) => r.map(escapeCsvCell).join(',')).join('\n')
  return body ? `${head}\n${body}` : head
}
