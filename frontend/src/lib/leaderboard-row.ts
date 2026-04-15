export type LeaderboardTableRow = {
  rank: number
  name: string
  role: string
  email: string
  points: string
}

/**
 * Parse `SystemStubResponse` item from `GET /api/v1/other/leaderboard`.
 * Tolerates spacing variants in the `detail` string (middle dot vs ASCII pipe).
 */
export function parseLeaderboardStubItem(
  row: Record<string, unknown>,
  index: number,
): LeaderboardTableRow {
  const rank =
    typeof row.count === 'number' && Number.isFinite(row.count) ? Math.trunc(row.count) : index + 1
  const title = typeof row.title === 'string' ? row.title : ''
  const name = title.replace(/^#\d+\s+/, '').trim() || '—'

  let role = '—'
  let email = '—'
  let points = '—'

  const detail = typeof row.detail === 'string' ? row.detail : ''
  if (detail) {
    const normalized = detail.replace(/\s*\|\s*/g, ' · ')
    const parts = normalized.split(' · ').map((p) => p.trim())
    if (parts.length >= 1) role = parts[0] || '—'
    if (parts.length >= 2) email = parts[1] || '—'
    const tail = parts.slice(2).join(' · ')
    const m = (tail || detail).match(/total points:\s*(\d+)/i)
    if (m?.[1]) points = m[1]
  }

  return { rank, name, role, email, points }
}
