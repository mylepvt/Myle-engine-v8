import { useCallback, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Download, RefreshCw, Search, Users } from 'lucide-react'

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

// ─── helpers ────────────────────────────────────────────────────────────────

function flatten(nodes: OrgNode[], depth = 0): { node: OrgNode; depth: number }[] {
  const out: { node: OrgNode; depth: number }[] = []
  for (const n of nodes) {
    out.push({ node: n, depth })
    out.push(...flatten(n.children, depth + 1))
  }
  return out
}

function nodeMatches(node: OrgNode, needle: string): boolean {
  if (
    node.name.toLowerCase().includes(needle) ||
    node.fbo_id.toLowerCase().includes(needle) ||
    node.role.toLowerCase().includes(needle)
  )
    return true
  return node.children.some((c) => nodeMatches(c, needle))
}

function filterTree(nodes: OrgNode[], needle: string): OrgNode[] {
  if (!needle) return nodes
  return nodes
    .filter((n) => nodeMatches(n, needle))
    .map((n) => ({ ...n, children: filterTree(n.children, needle) }))
}

function initials(name: string) {
  return name
    .split(/[_\s]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

// ─── avatar ─────────────────────────────────────────────────────────────────

const AVATAR_COLORS: Record<string, string> = {
  admin: 'from-primary/80 to-primary/40 text-white',
  leader: 'from-amber-500/80 to-amber-400/40 text-white',
  team: 'from-emerald-600/70 to-emerald-500/40 text-white',
}

function Avatar({ name, role, size = 'md' }: { name: string; role: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'size-12 text-base' : size === 'sm' ? 'size-7 text-[0.6rem]' : 'size-9 text-xs'
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold',
        sizeClass,
        AVATAR_COLORS[role] ?? 'from-muted/60 to-muted/30 text-muted-foreground',
      )}
    >
      {initials(name)}
    </div>
  )
}

// ─── role badge ─────────────────────────────────────────────────────────────

const ROLE_BADGE: Record<string, string> = {
  admin: 'bg-primary/15 text-primary border-primary/25',
  leader: 'bg-amber-400/15 text-amber-400 border-amber-400/25',
  team: 'bg-emerald-400/15 text-emerald-400 border-emerald-400/25',
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[0.58rem] font-bold uppercase tracking-widest',
        ROLE_BADGE[role] ?? 'bg-muted/30 text-muted-foreground border-white/10',
      )}
    >
      {role}
    </span>
  )
}

// ─── team member row (compact) ───────────────────────────────────────────────

function TeamMemberRow({ node, needle }: { node: OrgNode; needle: string }) {
  const hit =
    needle &&
    (node.name.toLowerCase().includes(needle) || node.fbo_id.toLowerCase().includes(needle))
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors',
        hit ? 'bg-primary/[0.06]' : 'hover:bg-white/[0.03]',
      )}
    >
      <Avatar name={node.name} role={node.role} size="sm" />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-xs font-medium', hit ? 'text-primary' : 'text-foreground')}>
          {node.name}
        </p>
        <p className="truncate font-mono text-[0.6rem] text-muted-foreground/60">{node.fbo_id}</p>
      </div>
      <RoleBadge role={node.role} />
      {node.team_size > 0 ? (
        <span className="flex items-center gap-0.5 text-[0.65rem] text-muted-foreground">
          <Users className="size-3" />{node.team_size}
        </span>
      ) : null}
    </div>
  )
}

// ─── leader card ─────────────────────────────────────────────────────────────

function LeaderCard({ node, needle, defaultOpen }: { node: OrgNode; needle: string; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen || !!needle)
  const hasTeam = node.children.length > 0
  const hit = needle && (node.name.toLowerCase().includes(needle) || node.fbo_id.toLowerCase().includes(needle))

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border transition-colors',
        node.role === 'admin'
          ? 'border-primary/30 bg-primary/[0.04]'
          : 'border-amber-400/20 bg-amber-400/[0.03]',
        hit ? 'ring-1 ring-primary/30' : '',
      )}
    >
      {/* Card header */}
      <button
        type="button"
        onClick={() => hasTeam && setOpen((s) => !s)}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
          hasTeam ? 'hover:bg-white/[0.03] cursor-pointer' : 'cursor-default',
        )}
      >
        <Avatar name={node.name} role={node.role} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('text-sm font-semibold', hit ? 'text-primary' : 'text-foreground')}>
              {node.name}
            </span>
            <RoleBadge role={node.role} />
          </div>
          <p className="mt-0.5 font-mono text-[0.65rem] text-muted-foreground/60">{node.fbo_id}</p>
          {node.team_size > 0 ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="size-3.5" />
              <span>{node.team_size} team member{node.team_size !== 1 ? 's' : ''}</span>
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground/50">No team members yet</p>
          )}
        </div>
        {hasTeam ? (
          <div className="shrink-0 text-muted-foreground">
            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </div>
        ) : null}
      </button>

      {/* Team members */}
      {hasTeam && open ? (
        <div className="border-t border-white/[0.06] px-2 pb-2 pt-1">
          {node.children.map((child) =>
            child.children.length > 0 ? (
              // Sub-leader: render recursively as nested card
              <div key={child.id} className="mt-1.5 ml-2">
                <LeaderCard node={child} needle={needle} defaultOpen={!!needle} />
              </div>
            ) : (
              <TeamMemberRow key={child.id} node={child} needle={needle} />
            ),
          )}
        </div>
      ) : null}
    </div>
  )
}

// ─── admin crown card ────────────────────────────────────────────────────────

function AdminCard({ node }: { node: OrgNode; needle?: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/[0.08] to-primary/[0.02] px-5 py-4">
      <div className="pointer-events-none absolute right-4 top-4 text-4xl opacity-10 select-none">👑</div>
      <div className="flex items-center gap-3">
        <Avatar name={node.name} role={node.role} size="lg" />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-bold text-foreground">{node.name}</span>
            <RoleBadge role={node.role} />
          </div>
          <p className="font-mono text-[0.65rem] text-muted-foreground/70">{node.fbo_id}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="size-3.5" />
            {node.team_size} total member{node.team_size !== 1 ? 's' : ''} across network
          </p>
        </div>
      </div>
      {/* Direct reports summary */}
      {node.children.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {node.children.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-400/[0.07] px-2 py-0.5 text-[0.65rem] text-amber-300"
            >
              {c.name}
              {c.team_size > 0 ? <span className="opacity-60">+{c.team_size}</span> : null}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// ─── main page ───────────────────────────────────────────────────────────────

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

  // Separate admin(s) from leaders/root-level nodes
  const adminNodes = tree.filter((n) => n.role === 'admin')
  const leaderNodes = tree.filter((n) => n.role !== 'admin')

  return (
    <div className="max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Live hierarchy — leaders, their teams, nested downlines.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={totalMembers === 0}
            onClick={downloadCsv}
            className="gap-1.5"
          >
            <Download className="size-3.5" />
            CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => void refetch()}
            className="gap-1.5"
          >
            <RefreshCw className={cn('size-3.5', isPending && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, FBO ID, role…"
          className="w-full rounded-xl border border-white/[0.10] bg-white/[0.05] py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Stats strip */}
      {data && !needle ? (
        <div className="flex flex-wrap gap-3">
          {(['admin', 'leader', 'team'] as const).map((r) => {
            const count = allFlat.filter(({ node }) => node.role === r).length
            return (
              <div
                key={r}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-3 py-2',
                  ROLE_BADGE[r],
                )}
              >
                <span className="text-xs font-bold uppercase tracking-widest">{r}</span>
                <span className="text-base font-bold">{count}</span>
              </div>
            )
          })}
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-muted-foreground">
            <Users className="size-4" />
            <span className="text-base font-bold">{totalMembers}</span>
            <span className="text-xs">total</span>
          </div>
        </div>
      ) : null}

      {/* Loading */}
      {isPending ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
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
        <div className="space-y-4">
          {/* Admin crown(s) */}
          {adminNodes.map((node) => (
            <AdminCard key={node.id} node={node} needle={needle} />
          ))}

          {/* Divider */}
          {adminNodes.length > 0 && leaderNodes.length > 0 ? (
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-white/[0.06]" />
              <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-muted-foreground/50">
                Leaders & Teams
              </span>
              <div className="h-px flex-1 bg-white/[0.06]" />
            </div>
          ) : null}

          {/* Leader cards grid */}
          {leaderNodes.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-1">
              {leaderNodes.map((node) => (
                <LeaderCard key={node.id} node={node} needle={needle} defaultOpen={node.team_size <= 5} />
              ))}
            </div>
          ) : null}

          {tree.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {needle ? 'No members match.' : 'No members.'}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Footer count */}
      {data && totalMembers > 0 ? (
        <p className="text-xs text-muted-foreground/60">
          {needle ? `${flatten(tree).length} of ` : ''}
          {totalMembers} member{totalMembers !== 1 ? 's' : ''}
          {needle ? ' match' : ''}
        </p>
      ) : null}
    </div>
  )
}
