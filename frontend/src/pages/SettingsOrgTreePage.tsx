import { useCallback, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useShellStubQuery } from '@/hooks/use-shell-stub-query'

type Props = { title: string }

type OrgRow = {
  member: string
  role: string
  fbo: string
  upline: string
}

/** Parse title "Name (role)" and detail "FBO 123 · upline: ..." */
function parseOrgRow(row: Record<string, unknown>): OrgRow {
  const titleRaw = typeof row.title === 'string' ? row.title : ''
  const detailRaw = typeof row.detail === 'string' ? row.detail : ''

  const roleMatch = titleRaw.match(/\(([^)]+)\)$/)
  const role = roleMatch ? roleMatch[1] : '—'
  const member = titleRaw.replace(/\s*\([^)]*\)$/, '').trim() || '—'

  const fboPart = detailRaw.match(/FBO\s+([^\s·]+)/)
  const fbo = fboPart ? fboPart[1] : '—'

  const uplinePart = detailRaw.match(/upline:\s*(.+)$/)
  const upline = uplinePart ? uplinePart[1].trim() : '—'

  return { member, role, fbo, upline }
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-primary/15 text-primary',
  leader: 'bg-amber-400/15 text-amber-400',
  team: 'bg-[hsl(142_71%_48%)]/15 text-[hsl(142_71%_48%)]',
}

export function SettingsOrgTreePage({ title }: Props) {
  const { data, isPending, isError, error, refetch } = useShellStubQuery('/api/v1/settings/org-tree')
  const [q, setQ] = useState('')

  const rows = useMemo<OrgRow[]>(() => (data?.items ?? []).map(parseOrgRow), [data])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(
      (r) =>
        r.member.toLowerCase().includes(needle) ||
        r.fbo.toLowerCase().includes(needle) ||
        r.upline.toLowerCase().includes(needle) ||
        r.role.toLowerCase().includes(needle),
    )
  }, [rows, q])

  const downloadCsv = useCallback(() => {
    const header = ['Member', 'Role', 'FBO ID', 'Upline'].join(',')
    const body = filtered
      .map((r) =>
        [r.member, r.role, r.fbo, r.upline]
          .map((v) => `"${v.replace(/"/g, '""')}"`)
          .join(','),
      )
      .join('\n')
    const csv = `${header}\n${body}`
    let url: string | undefined
    try {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `org-tree-${new Date().toISOString().slice(0, 10)}.csv`
      a.rel = 'noopener'
      a.click()
    } finally {
      if (url) URL.revokeObjectURL(url)
    }
  }, [filtered])

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Flat directory from{' '}
            <code className="rounded bg-white/10 px-1 text-xs">users.upline_user_id</code>.
            Sorted by user id.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={filtered.length === 0}
            onClick={downloadCsv}
          >
            Download CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => void refetch()}
          >
            {isPending ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>

      {isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : null}
      {isError ? (
        <div className="text-sm text-destructive" role="alert">
          <span>{error instanceof Error ? error.message : 'Could not load'} </span>
          <button type="button" className="underline underline-offset-2" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}
      {data ? (
        <div className="space-y-3">
          {data.note ? <p className="text-xs text-muted-foreground">{data.note}</p> : null}
          <label className="block max-w-xs text-sm">
            <span className="mb-1 block text-ds-caption text-muted-foreground">Search members</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, FBO ID, upline…"
              className="w-full rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-2 text-sm text-foreground shadow-glass-inset backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-primary/35"
            />
          </label>
          <div className="surface-elevated overflow-x-auto p-3">
            <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-[1] bg-muted/40 backdrop-blur-sm">
                <tr className="border-b border-white/10 text-ds-caption text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Member</th>
                  <th className="py-2 pr-4 font-medium">Role</th>
                  <th className="py-2 pr-4 font-medium">FBO ID</th>
                  <th className="py-2 font-medium">Upline</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={i} className="border-b border-white/[0.06]">
                    <td className="py-2.5 pr-4 font-medium text-foreground">{r.member}</td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[r.role] ?? 'bg-muted/30 text-muted-foreground'}`}
                      >
                        {r.role}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs text-muted-foreground">{r.fbo}</td>
                    <td className="py-2.5 text-muted-foreground">{r.upline}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 ? (
              <p className="mt-3 text-muted-foreground">
                {q ? 'No members match your search.' : 'No users in database.'}
              </p>
            ) : null}
          </div>
          {rows.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {filtered.length} of {rows.length} member{rows.length !== 1 ? 's' : ''}
              {q ? ' (filtered)' : ''}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
