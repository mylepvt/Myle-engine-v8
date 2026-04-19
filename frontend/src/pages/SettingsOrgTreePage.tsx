import { useCallback, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch } from '@/lib/api'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

type Props = { title: string }

type OrgNode = {
  id: number
  name: string
  fbo_id: string
  role: string
  team_size: number
  children: OrgNode[]
}

type OrgTreeResponse = {
  items: OrgNode[]
  total: number
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-primary/15 text-primary border-primary/20',
  leader: 'bg-amber-400/15 text-amber-400 border-amber-400/20',
  team: 'bg-emerald-400/15 text-emerald-400 border-emerald-400/20',
}

const ROLE_LINE: Record<string, string> = {
  admin: 'border-primary/30',
  leader: 'border-amber-400/30',
  team: 'border-emerald-400/20',
}

/** Flatten tree to list of {node, depth} for search matching */
function flatten(nodes: OrgNode[], depth = 0): { node: OrgNode; depth: number }[] {
  const out: { node: OrgNode; depth: number }[] = []
  for (const n of nodes) {
    out.push({ node: n, depth })
    out.push(...flatten(n.children, depth + 1))
  }
  return out
}

/** Check if node or any descendant matches needle */
function nodeMatches(node: OrgNode, needle: string): boolean {
  if (
    node.name.toLowerCase().includes(needle) ||
    node.fbo_id.toLowerCase().includes(needle) ||
    node.role.toLowerCase().includes(needle)
  )
    return true
  return node.children.some((c) => nodeMatches(c, needle))
}

/** Filter tree keeping only branches with a match */
function filterTree(nodes: OrgNode[], needle: string): OrgNode[] {
  if (!needle) return nodes
  return nodes
    .filter((n) => nodeMatches(n, needle))
    .map((n) => ({ ...n, children: filterTree(n.children, needle) }))
}

function TreeNode({
  node,
  depth,
  needle,
  defaultOpen,
}: {
  node: OrgNode
  depth: number
  needle: string
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const hasChildren = node.children.length > 0

  const highlight = needle
    ? node.name.toLowerCase().includes(needle) ||
      node.fbo_id.toLowerCase().includes(needle) ||
      node.role.toLowerCase().includes(needle)
    : false

  return (
    <div className={cn('relative', depth > 0 && 'ml-5 border-l', ROLE_LINE[node.role] ?? 'border-white/10')}>
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg px-2 py-2 transition-colors',
          highlight ? 'bg-primary/[0.07]' : 'hover:bg-white/[0.03]',
        )}
      >
        {/* Expand/collapse toggle */}
        <button
          type="button"
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors',
            hasChildren
              ? 'hover:bg-white/10 hover:text-foreground'
              : 'pointer-events-none opacity-0',
          )}
          onClick={() => setOpen((s) => !s)}
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          {hasChildren ? (
            open ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )
          ) : null}
        </button>

        {/* Name + role badge */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('font-medium text-foreground text-sm', highlight && 'text-primary')}>
              {node.name}
            </span>
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide',
                ROLE_COLORS[node.role] ?? 'bg-muted/30 text-muted-foreground border-white/10',
              )}
            >
              {node.role}
            </span>
            {node.team_size > 0 ? (
              <span className="flex items-center gap-1 text-[0.68rem] text-muted-foreground">
                <Users className="size-3" />
                {node.team_size}
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 font-mono text-[0.65rem] text-muted-foreground/70">
            {node.fbo_id}
          </div>
        </div>
      </div>

      {/* Children */}
      {hasChildren && open ? (
        <div className="pl-1">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              needle={needle}
              defaultOpen={depth < 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function SettingsOrgTreePage({ title }: Props) {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['org', 'tree'],
    queryFn: async () => {
      const r = await apiFetch('/api/v1/org/tree?include_inactive=true')
      if (!r.ok) throw new Error(await r.text())
      return r.json() as Promise<OrgTreeResponse>
    },
    staleTime: 60_000,
  })

  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()

  const tree = useMemo(() => filterTree(data?.items ?? [], needle), [data, needle])

  const allFlat = useMemo(() => flatten(data?.items ?? []), [data])

  const downloadCsv = useCallback(() => {
    const header = ['Member', 'Role', 'FBO ID', 'Team size'].join(',')
    const body = allFlat
      .map(({ node }) =>
        [node.name, node.role, node.fbo_id, node.team_size]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
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
  }, [allFlat])

  const totalMembers = allFlat.length

  return (
    <div className="max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Hierarchy by upline. Expand nodes to see team members.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={totalMembers === 0}
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

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[0.68rem]">
        {(['admin', 'leader', 'team'] as const).map((r) => (
          <span
            key={r}
            className={cn(
              'inline-flex items-center rounded-full border px-2 py-0.5 font-semibold uppercase tracking-wide',
              ROLE_COLORS[r],
            )}
          >
            {r}
          </span>
        ))}
        <span className="flex items-center gap-1 text-muted-foreground">
          <Users className="size-3" /> = team size (all descendants)
        </span>
      </div>

      {/* Search */}
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search name, FBO ID, role…"
        className="w-full max-w-xs rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-2 text-sm text-foreground shadow-glass-inset backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-primary/35"
      />

      {/* States */}
      {isPending ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : null}

      {isError ? (
        <div className="text-sm text-destructive" role="alert">
          {error instanceof Error ? error.message : 'Could not load'}{' '}
          <button type="button" className="underline underline-offset-2" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {/* Tree */}
      {data ? (
        <div className="surface-elevated space-y-0.5 rounded-xl border border-border p-3">
          {tree.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {needle ? 'No members match your search.' : 'No members.'}
            </p>
          ) : (
            tree.map((node) => (
              <TreeNode
                key={node.id}
                node={node}
                depth={0}
                needle={needle}
                defaultOpen={true}
              />
            ))
          )}
        </div>
      ) : null}

      {data && totalMembers > 0 ? (
        <p className="text-xs text-muted-foreground">
          {needle ? `${flatten(tree).length} of ` : ''}
          {totalMembers} member{totalMembers !== 1 ? 's' : ''}
          {needle ? ' match' : ''}
        </p>
      ) : null}
    </div>
  )
}
