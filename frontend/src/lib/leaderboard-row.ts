export type LeaderboardTableRow = {
  rank: number
  name: string
  role: string
  email: string
  points: string
  xp: string
  level: string
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
  let xp = '—'
  let level = '—'

  const detail = typeof row.detail === 'string' ? row.detail : ''
  if (detail) {
    const normalized = detail.replace(/\s*\|\s*/g, ' · ')
    const parts = normalized.split(' · ').map((p) => p.trim())
    if (parts.length >= 1) role = parts[0] || '—'
    if (parts.length >= 2) email = parts[1] || '—'
    const tail = parts.slice(2).join(' · ')
    const mPts = (tail || detail).match(/total points:\s*(\d+)/i)
    if (mPts?.[1]) points = mPts[1]
    const mXp = (tail || detail).match(/xp:\s*(\d+)/i)
    if (mXp?.[1]) xp = mXp[1]
    const mLvl = (tail || detail).match(/level:\s*([a-z_]+)/i)
    if (mLvl?.[1]) level = mLvl[1].toLowerCase()
  }

  return { rank, name, role, email, points, xp, level }
}
