import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import {
  Building2,
  Columns2,
  Download,
  GitBranch,
  Network,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { MemberProfileModal } from '@/components/team/member-profile-modal'
import { ResetPasswordModal } from '@/components/team/reset-password-modal'
import { type ResetTarget } from '@/components/team/member-utils'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { useOrgTreeQuery, type OrgTreeNode } from '@/hooks/use-org-tree-query'
import { useTeamMembersQuery, type TeamMemberPublic } from '@/hooks/use-team-query'
import { cn } from '@/lib/utils'

type Props = { title: string }

type OrgNode = OrgTreeNode

type FlatNode = {
  node: OrgNode
  depth: number
  path: OrgNode[]
}

type HandoffColumn = {
  leader: FlatNode
  members: FlatNode[]
}

function flatten(nodes: OrgNode[], depth = 0, path: OrgNode[] = []): FlatNode[] {
  const out: FlatNode[] = []
  for (const node of nodes) {
    const nextPath = [...path, node]
    out.push({ node, depth, path: nextPath })
    out.push(...flatten(node.children, depth + 1, nextPath))
  }
  return out
}

function initials(name: string): string {
  return (
    name
      .split(/[_\s]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'U'
  )
}

function buildHandoffData(items: FlatNode[]): {
  columns: HandoffColumn[]
  unassigned: FlatNode[]
} {
  const leaders = items.filter((f) => f.node.role === 'leader')
  const parentIsLeader = new Map<number, boolean>()
  const parentMap = new Map<number, number | null>()

  for (const item of items) {
    const parentId = item.path.length > 1 ? item.path[item.path.length - 2].id : null
    parentMap.set(item.node.id, parentId)
    parentIsLeader.set(
      item.node.id,
      parentId !== null && (items.find((f) => f.node.id === parentId)?.node.role ?? '') === 'leader',
    )
  }

  const columns: HandoffColumn[] = leaders.map((leader) => ({
    leader,
    members: items.filter((f) => parentMap.get(f.node.id) === leader.node.id),
  }))

  const unassigned = items.filter(
    (f) => f.node.role !== 'admin' && f.node.role !== 'leader' && !parentIsLeader.get(f.node.id),
  )

  return { columns, unassigned }
}

function HandoffColumnCard({
  column,
  topLeaderIds,
  selectedId,
  onSelect,
  onCardClick,
}: {
  column: HandoffColumn
  topLeaderIds: Set<number>
  selectedId: number | null
  onSelect: (id: number) => void
  onCardClick: (node: OrgNode) => void
}) {
  const leader = column.leader
  const isTopLeader = topLeaderIds.has(leader.node.id)

  return (
    <div className="flex w-[230px] shrink-0 flex-col overflow-hidden rounded-xl border border-zinc-800/70 bg-zinc-900/50">
      <div className="flex items-center gap-2.5 border-b border-zinc-800/60 px-3 py-3">
        <div className="flex size-7 items-center justify-center rounded-md bg-gradient-to-br from-amber-400 to-amber-600 text-[11px] font-bold text-white shrink-0">
          {initials(leader.node.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-zinc-100">{leader.node.name}</p>
          <p className="font-mono text-[10px] text-zinc-600">
            Leader{isTopLeader ? '' : ' · under a member'}
            {!isTopLeader ? <span className="ml-0.5 text-amber-500/60">⚠</span> : null}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-zinc-700/60 px-2 py-0.5 text-[10px] text-zinc-400">
          {column.members.length}
        </span>
      </div>

      <div className="flex flex-col gap-1.5 p-2">
        {column.members.map((item) => (
            <button
              key={item.node.id}
              type="button"
              onClick={() => {
                onSelect(item.node.id)
                onCardClick(item.node)
              }}
              className={cn(
                'flex items-center gap-2 rounded-lg border border-zinc-800/50 bg-zinc-900/60 px-2.5 py-2 text-left transition-colors hover:bg-zinc-800/60',
                item.node.id === selectedId && 'ring-2 ring-primary/20',
              )}
            >
            <span
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                item.node.role === 'leader' ? 'bg-amber-400' : 'bg-emerald-400',
              )}
            />
            <span className="truncate text-[12px] text-zinc-200">{item.node.name}</span>
            {item.node.children.length > 0 && item.node.role === 'leader' ? (
              <span className="ml-auto shrink-0 text-[10px] text-zinc-600">
                +{item.node.children.length} sub
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {!isTopLeader ? (
        <div className="border-t border-zinc-800/40 px-3 py-2">
          <p className="text-[10px] text-zinc-600">
            Sits under{' '}
            {leader.path.length > 1
              ? leader.path[leader.path.length - 2]?.name ?? 'root'
              : 'root'}
            . Works, but move under a top leader to clean up.
          </p>
        </div>
      ) : null}
    </div>
  )
}

export function SettingsOrgTreePage({ title }: Props) {
  const { data, isPending, isError, error, refetch } = useOrgTreeQuery({
    includeInactive: true,
  })
  const { data: authMe } = useAuthMeQuery()
  const isAdmin = authMe?.authenticated && authMe.role === 'admin'
  const isAdminOrLeader =
    authMe?.authenticated && (authMe.role === 'admin' || authMe.role === 'leader')

  const teamMembersQuery = useTeamMembersQuery()

  const membersByFboId = useMemo(
    () => new Map((teamMembersQuery.data?.items ?? []).map((m) => [m.fbo_id, m])),
    [teamMembersQuery.data?.items],
  )

  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [profileTarget, setProfileTarget] = useState<TeamMemberPublic | null>(null)
  const [resetTarget, setResetTarget] = useState<ResetTarget | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  function handleCardClick(node: OrgTreeNode) {
    const member = membersByFboId.get(node.fbo_id)
    if (!member) return
    if (isAdmin) {
      setProfileTarget(member)
    } else if (isAdminOrLeader) {
      setResetTarget({ id: member.id, fbo_id: member.fbo_id, email: member.email })
    }
  }

  useEffect(() => {
    if (!toastMsg) return
    const id = window.setTimeout(() => setToastMsg(null), 2500)
    return () => window.clearTimeout(id)
  }, [toastMsg])

  const deferredQuery = useDeferredValue(query)
  const needle = deferredQuery.trim().toLowerCase()

  const filteredTree = useMemo(() => {
    if (!needle) return data?.items ?? []
    function nodeMatches(n: OrgNode, q: string): boolean {
      if (
        n.name.toLowerCase().includes(q) ||
        n.fbo_id.toLowerCase().includes(q) ||
        n.role.toLowerCase().includes(q)
      )
        return true
      return n.children.some((c) => nodeMatches(c, q))
    }
    function filterTree(nodes: OrgNode[], q: string): OrgNode[] {
      if (!q) return nodes
      return nodes
        .filter((n) => nodeMatches(n, q))
        .map((n) => ({ ...n, children: filterTree(n.children, q) }))
    }
    return filterTree(data?.items ?? [], needle)
  }, [data, needle])

  const allFlat = useMemo(() => flatten(data?.items ?? []), [data])
  const filteredFlat = useMemo(() => flatten(filteredTree), [filteredTree])

  const flatById = useMemo(
    () => new Map(allFlat.map((item) => [item.node.id, item])),
    [allFlat],
  )

  const selected = useMemo(() => {
    if (selectedId !== null) {
      const byId = flatById.get(selectedId)
      if (byId) return byId
    }
    return filteredFlat[0] ?? allFlat[0] ?? null
  }, [allFlat, filteredFlat, flatById, selectedId])

  const totalMembers = allFlat.length
  const adminCount = allFlat.filter((item) => item.node.role === 'admin').length
  const leaderCount = allFlat.filter((item) => item.node.role === 'leader').length
  const teamCount = allFlat.filter((item) => item.node.role === 'team').length

  const searchActive = needle.length > 0

  const biggestBranch = useMemo(() => {
    return allFlat.reduce<FlatNode | null>((best, item) => {
      if (!best || item.node.team_size > best.node.team_size) return item
      return best
    }, null)
  }, [allFlat])

  const highlightedBranches = useMemo(() => {
    return allFlat
      .filter((item) => item.node.role !== 'team' && item.node.team_size > 0)
      .sort((a, b) => b.node.team_size - a.node.team_size)
      .slice(0, 4)
  }, [allFlat])

  const downloadCsv = () => {
    const header = ['Member', 'Role', 'FBO ID', 'Team size', 'Depth', 'Path'].join(',')
    const body = allFlat
      .map((item) =>
        [
          item.node.name,
          item.node.role,
          item.node.fbo_id,
          item.node.team_size,
          item.depth + 1,
          item.path
            .slice(0, -1)
            .map((i) => i.name)
            .join(' / ') || 'Top level',
        ]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(','),
      )
      .join('\n')

    const csv = `${header}\n${body}`
    let url: string | undefined

    try {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `org-tree-${new Date().toISOString().slice(0, 10)}.csv`
      anchor.rel = 'noopener'
      anchor.click()
    } finally {
      if (url) URL.revokeObjectURL(url)
    }
  }

  return (
    <div className="max-w-7xl space-y-5">
      <section className="surface-elevated relative overflow-hidden px-5 py-5 md:px-6 md:py-6">
        <div className="pointer-events-none absolute -left-20 top-0 size-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-0 size-48 rounded-full bg-accent/25 blur-3xl" />

        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl space-y-4">
            <Badge variant="primary" className="w-fit gap-1.5 px-3 py-1">
              <Network className="size-3.5" />
              Organisation
            </Badge>

            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                {title}
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
                Each column is a leader. The cards show people whose leads actually land on that
                leader&apos;s board. The red column is where handoffs are falling through.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:w-[32rem]">
            <div className="surface-inset relative overflow-hidden px-4 py-3">
              <div className="pointer-events-none absolute right-2 top-2 opacity-10">
                <Users className="size-5" />
              </div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                People mapped
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                {totalMembers}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{teamCount} members plus leadership seats</p>
            </div>
            <div className="surface-inset relative overflow-hidden px-4 py-3">
              <div className="pointer-events-none absolute right-2 top-2 opacity-10">
                <GitBranch className="size-5" />
              </div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Leaders
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                {leaderCount}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{adminCount} admin root{adminCount === 1 ? '' : 's'} above them</p>
            </div>
            <div className="surface-inset relative overflow-hidden px-4 py-3">
              <div className="pointer-events-none absolute right-2 top-2 opacity-10">
                <Building2 className="size-5" />
              </div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Largest branch
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                {biggestBranch ? `+${biggestBranch.node.team_size}` : 0}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {biggestBranch ? biggestBranch.node.name : 'No branch yet'}
              </p>
            </div>
          </div>
        </div>

        {highlightedBranches.length > 0 ? (
          <div className="relative mt-6 flex flex-wrap gap-2">
            {highlightedBranches.map((item) => (
              <button
                key={item.node.id}
                type="button"
                onClick={() => setSelectedId(item.node.id)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-left transition-colors',
                  item.node.id === selected?.node.id
                    ? 'border-primary/20 bg-primary/[0.08] text-primary'
                    : 'border-border bg-muted/45 text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                )}
              >
                <span className="font-medium">{item.node.name}</span>
                <span className="font-mono text-[0.68rem] opacity-75">{item.node.fbo_id}</span>
                <Badge variant="outline">+{item.node.team_size}</Badge>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <section className="surface-elevated p-4 md:p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative max-w-xl flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, FBO ID, or role"
              className="pl-9"
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={totalMembers === 0}
              onClick={downloadCsv}
            >
              <Download className="size-4" />
              CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => void refetch()}
            >
              <RefreshCw className={cn('size-4', isPending && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/[0.08] px-2.5 py-1 text-[0.68rem] font-medium text-primary">
            <span className="uppercase tracking-[0.2em]">Admins</span>
            <span className="text-foreground">{adminCount}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/25 bg-warning/10 px-2.5 py-1 text-[0.68rem] font-medium text-warning">
            <span className="uppercase tracking-[0.2em]">Leaders</span>
            <span className="text-foreground">{leaderCount}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success/[0.09] px-2.5 py-1 text-[0.68rem] font-medium text-success">
            <span className="uppercase tracking-[0.2em]">Team</span>
            <span className="text-foreground">{teamCount}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/45 px-2.5 py-1 text-[0.68rem] font-medium text-muted-foreground">
            <span className="uppercase tracking-[0.2em]">{searchActive ? 'Matches' : 'Visible'}</span>
            <span className="text-foreground">{filteredFlat.length}</span>
          </span>
        </div>
      </section>

      {isPending ? (
        <div className="surface-elevated p-8">
          <LoadingState label="Loading organisation map..." />
        </div>
      ) : null}

      {isError ? (
        <ErrorState
          title="Could not load the organisation tree"
          message={error instanceof Error ? error.message : 'Please try again.'}
          onRetry={() => void refetch()}
        />
      ) : null}

      {!isPending && !isError ? (
        <div className="surface-elevated overflow-hidden p-4 md:p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-md border border-primary/20 bg-primary/[0.08] p-2 text-primary">
              <Columns2 className="size-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Organisation — Handoff View</p>
              <p className="text-xs text-muted-foreground">
                Each column is a leader. The cards are the people whose leads actually land on that
                leader&apos;s board. The red column is where handoffs are falling through.
              </p>
            </div>
          </div>

          {(() => {
            const { columns, unassigned } = buildHandoffData(searchActive ? filteredFlat : allFlat)
            const topLeaderIds = new Set(data?.items.map((n) => n.id) ?? [])

            if (columns.length === 0 && unassigned.length === 0) {
              return (
                <EmptyState
                  title="No handoff data"
                  description="Leaders and their direct reports will appear here as columns."
                  className="border-none bg-transparent px-0 py-8"
                />
              )
            }

            return (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {columns.map((col) => (
                  <HandoffColumnCard
                    key={col.leader.node.id}
                    column={col}
                    topLeaderIds={topLeaderIds}
                    selectedId={selected?.node.id ?? null}
                    onSelect={setSelectedId}
                    onCardClick={handleCardClick}
                  />
                ))}

                {unassigned.length > 0 ? (
                  <div className="flex w-[230px] shrink-0 flex-col overflow-hidden rounded-xl border border-red-500/25 bg-red-950/20">
                    <div className="flex items-center gap-2.5 border-b border-red-500/15 px-3 py-3">
                      <div className="flex size-7 items-center justify-center rounded-md bg-red-500/20 text-[11px] font-bold text-red-400 shrink-0">
                        !
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-red-400">No leader</p>
                        <p className="font-mono text-[10px] text-red-500/50">handoff drops here</p>
                      </div>
                      <span className="shrink-0 rounded-full border border-red-500/20 px-2 py-0.5 text-[10px] text-red-400">
                        {unassigned.length}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1.5 p-2">
                      {unassigned.map((item) => (
                        <button
                          key={item.node.id}
                          type="button"
                          onClick={() => {
                            setSelectedId(item.node.id)
                            handleCardClick(item.node)
                          }}
                          className={cn(
                            'flex items-center gap-2 rounded-lg border border-red-500/15 bg-red-950/30 px-2.5 py-2 text-left transition-colors hover:bg-red-950/50',
                            item.node.id === selected?.node.id && 'ring-2 ring-red-500/20',
                          )}
                        >
                          <span className="size-1.5 shrink-0 rounded-full bg-red-500" />
                          <span className="truncate text-[12px] text-red-200/80">{item.node.name}</span>
                        </button>
                      ))}
                    </div>

                    <div className="mt-auto border-t border-dashed border-red-500/15 px-3 py-2.5 text-center">
                      <button
                        type="button"
                        className="text-[11px] text-red-400/70 transition-colors hover:text-red-300"
                      >
                        + Assign these to a leader
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })()}
        </div>
      ) : null}

      {resetTarget ? (
        <ResetPasswordModal
          target={resetTarget}
          onClose={() => setResetTarget(null)}
          onSuccess={(name) => setToastMsg(`Password reset for ${name}`)}
        />
      ) : null}

      {profileTarget ? (
        <MemberProfileModal
          member={profileTarget}
          onClose={() => setProfileTarget(null)}
        />
      ) : null}

      {toastMsg ? (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] right-4 z-[85] max-w-[min(22rem,calc(100vw-2rem))] rounded-md border border-emerald-500/35 bg-emerald-500/15 px-3 py-2 text-ds-caption font-semibold text-emerald-600 dark:text-emerald-200 shadow-lg">
          {toastMsg}
        </div>
      ) : null}
    </div>
  )
}
