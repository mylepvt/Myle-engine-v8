import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Download,
  GitBranch,
  Layers2,
  Network,
  RefreshCw,
  Search,
  User,
  Users,
} from 'lucide-react'

import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useOrgTreeQuery, type OrgTreeNode } from '@/hooks/use-org-tree-query'
import { cn } from '@/lib/utils'

type Props = { title: string }

type OrgNode = OrgTreeNode

type FlatNode = {
  node: OrgNode
  depth: number
  path: OrgNode[]
}

type BranchMix = {
  admin: number
  leader: number
  team: number
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

function nodeMatches(node: OrgNode, needle: string): boolean {
  if (!needle) return true
  if (
    node.name.toLowerCase().includes(needle) ||
    node.fbo_id.toLowerCase().includes(needle) ||
    node.role.toLowerCase().includes(needle)
  ) {
    return true
  }
  return node.children.some((child) => nodeMatches(child, needle))
}

function filterTree(nodes: OrgNode[], needle: string): OrgNode[] {
  if (!needle) return nodes
  return nodes
    .filter((node) => nodeMatches(node, needle))
    .map((node) => ({
      ...node,
      children: filterTree(node.children, needle),
    }))
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

function roleLabel(role: string): string {
  if (role === 'admin') return 'Admin'
  if (role === 'leader') return 'Leader'
  if (role === 'team') return 'Member'
  return role
}

function roleBadgeVariant(role: string): BadgeProps['variant'] {
  if (role === 'admin') return 'primary'
  if (role === 'leader') return 'warning'
  if (role === 'team') return 'success'
  return 'outline'
}

function avatarTone(role: string): string {
  if (role === 'admin') return 'from-primary to-primary/65 text-primary-foreground'
  if (role === 'leader') return 'from-warning to-warning/70 text-warning-foreground'
  return 'from-success to-success/70 text-success-foreground'
}

function roleSurfaceTone(role: string): string {
  if (role === 'admin') return 'border-primary/20 bg-primary/[0.06]'
  if (role === 'leader') return 'border-warning/25 bg-warning/10'
  if (role === 'team') return 'border-success/20 bg-success/[0.08]'
  return 'border-border bg-muted/35'
}

function nodeDescription(node: OrgNode): string {
  if (node.role === 'admin') {
    return 'Executive root for this side of the organisation. Best used as the top-level entry point into the network.'
  }
  if (node.role === 'leader') {
    return node.children.length > 0
      ? 'Owns a reporting lane and manages execution across a focused team branch.'
      : 'Leadership seat is ready, but no direct team members are attached yet.'
  }
  return 'Individual contributor in the delivery layer of the network.'
}

function getBranchMix(node: OrgNode): BranchMix {
  const flat = flatten([node])
  return flat.reduce<BranchMix>(
    (acc, item) => {
      if (item.node.role === 'admin') acc.admin += 1
      else if (item.node.role === 'leader') acc.leader += 1
      else if (item.node.role === 'team') acc.team += 1
      return acc
    },
    { admin: 0, leader: 0, team: 0 },
  )
}

function countDescendantsByRole(node: OrgNode, role: keyof BranchMix): number {
  return flatten(node.children).filter((item) => item.node.role === role).length
}

function countDirectLeaders(node: OrgNode): number {
  return node.children.filter((child) => child.role === 'leader').length
}

function countMaxDepth(items: FlatNode[]): number {
  if (items.length === 0) return 0
  return items.reduce((max, item) => Math.max(max, item.depth + 1), 1)
}

function formatPath(path: OrgNode[]): string {
  if (path.length <= 1) return 'Top level'
  return path
    .slice(0, -1)
    .map((item) => item.name)
    .join(' / ')
}

function NodeAvatar({
  name,
  role,
  size = 'md',
}: {
  name: string
  role: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const sizeClass =
    size === 'lg'
      ? 'size-14 text-base'
      : size === 'sm'
        ? 'size-8 text-[0.68rem]'
        : 'size-10 text-sm'

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br font-semibold shadow-sm',
        sizeClass,
        avatarTone(role),
      )}
    >
      {initials(name)}
    </div>
  )
}

function RolePill({ role, className }: { role: string; className?: string }) {
  return (
    <Badge variant={roleBadgeVariant(role)} className={cn('px-2.5 py-1', className)}>
      {roleLabel(role)}
    </Badge>
  )
}

function MetricTile({
  label,
  value,
  hint,
  icon,
}: {
  label: string
  value: string | number
  hint?: string
  icon: React.ReactNode
}) {
  return (
    <div className="surface-inset relative overflow-hidden px-4 py-3">
      <div className="pointer-events-none absolute right-2 top-2 opacity-10">{icon}</div>
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function StatChip({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string | number
  tone?: 'neutral' | 'primary' | 'warning' | 'success'
}) {
  const toneClass =
    tone === 'primary'
      ? 'border-primary/20 bg-primary/[0.08] text-primary'
      : tone === 'warning'
        ? 'border-warning/25 bg-warning/10 text-warning'
        : tone === 'success'
          ? 'border-success/20 bg-success/[0.09] text-success'
          : 'border-border bg-muted/45 text-muted-foreground'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.68rem] font-medium',
        toneClass,
      )}
    >
      <span className="uppercase tracking-[0.2em]">{label}</span>
      <span className="text-foreground">{value}</span>
    </span>
  )
}

function MiniNodeChip({
  node,
  selected,
  onSelect,
}: {
  node: OrgNode
  selected: boolean
  onSelect: (id: number) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-left text-xs transition-colors',
        selected
          ? 'border-primary/25 bg-primary/[0.08] text-primary'
          : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground',
      )}
    >
      <span className="truncate">{node.name}</span>
      <RolePill role={node.role} className="px-2 py-0.5 text-[0.58rem]" />
    </button>
  )
}

function LeafNodeCard({
  node,
  selected,
  onSelect,
}: {
  node: OrgNode
  selected: boolean
  onSelect: (id: number) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      className={cn(
        'surface-inset flex w-full items-start gap-3 px-3 py-3 text-left transition-colors',
        roleSurfaceTone(node.role),
        selected
          ? 'ring-2 ring-primary/20 shadow-ios-card'
          : 'hover:-translate-y-0.5 hover:border-primary/15 hover:bg-white/[0.58] hover:shadow-sm',
      )}
    >
      <NodeAvatar name={node.name} role={node.role} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium text-foreground">{node.name}</p>
          <RolePill role={node.role} className="px-2 py-0.5 text-[0.58rem]" />
        </div>
        <p className="mt-1 truncate font-mono text-[0.68rem] text-muted-foreground">{node.fbo_id}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Individual contributor node with no direct reports attached.
        </p>
      </div>
    </button>
  )
}

function CompositionBar({ mix }: { mix: BranchMix }) {
  const total = mix.admin + mix.leader + mix.team
  if (total === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex h-2 overflow-hidden rounded-full bg-muted/65">
        {mix.admin > 0 ? (
          <div className="bg-primary" style={{ width: `${(mix.admin / total) * 100}%` }} />
        ) : null}
        {mix.leader > 0 ? (
          <div className="bg-warning" style={{ width: `${(mix.leader / total) * 100}%` }} />
        ) : null}
        {mix.team > 0 ? (
          <div className="bg-success" style={{ width: `${(mix.team / total) * 100}%` }} />
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <StatChip label="Admin" value={mix.admin} tone="primary" />
        <StatChip label="Leader" value={mix.leader} tone="warning" />
        <StatChip label="Team" value={mix.team} tone="success" />
      </div>
    </div>
  )
}

type TreeBranchCardProps = {
  node: OrgNode
  depth: number
  selectedId: number | null
  activePathIds: Set<number>
  searchActive: boolean
  onSelect: (id: number) => void
}

function TreeBranchCard({
  node,
  depth,
  selectedId,
  activePathIds,
  searchActive,
  onSelect,
}: TreeBranchCardProps) {
  const hasChildren = node.children.length > 0
  const isSelected = node.id === selectedId
  const isActivePath = activePathIds.has(node.id)
  const defaultOpen = depth < 1 || searchActive || isActivePath || node.children.length <= 3
  const [open, setOpen] = useState(defaultOpen)

  useEffect(() => {
    if (searchActive || isActivePath) {
      setOpen(true)
    }
  }, [searchActive, isActivePath])

  const branchChildren = node.children.filter((child) => child.children.length > 0)
  const leafChildren = node.children.filter((child) => child.children.length === 0)
  const directLeaders = countDirectLeaders(node)
  const directMembers = node.children.filter((child) => child.role === 'team').length

  return (
    <div
      className={cn(
        'relative',
        depth > 0 && 'pl-5 before:absolute before:bottom-0 before:left-0 before:top-0 before:w-px before:bg-border/75',
      )}
    >
      <div
        className={cn(
          'surface-elevated relative overflow-hidden',
          roleSurfaceTone(node.role),
          isSelected && 'ring-2 ring-primary/20 shadow-ios-card',
          !isSelected && 'hover:border-primary/15',
        )}
      >
        <div className="pointer-events-none absolute -right-14 -top-14 size-28 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 left-4 size-24 rounded-full bg-accent/20 blur-3xl" />

        <div className="relative flex items-start gap-3 px-4 py-4">
          <button
            type="button"
            onClick={() => onSelect(node.id)}
            className="flex min-w-0 flex-1 items-start gap-3 text-left"
          >
            <NodeAvatar name={node.name} role={node.role} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-semibold text-foreground">{node.name}</p>
                <RolePill role={node.role} />
                {isSelected ? <Badge variant="outline">Focused</Badge> : null}
              </div>
              <p className="mt-1 truncate font-mono text-[0.7rem] text-muted-foreground">
                {node.fbo_id}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatChip label="Direct" value={node.children.length} />
                <StatChip label="Downline" value={node.team_size} tone="primary" />
                {directLeaders > 0 ? (
                  <StatChip label="Leaders" value={directLeaders} tone="warning" />
                ) : null}
                {directMembers > 0 ? (
                  <StatChip label="Team" value={directMembers} tone="success" />
                ) : null}
              </div>
            </div>
          </button>

          {hasChildren ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={open ? 'Collapse branch' : 'Expand branch'}
              onClick={() => setOpen((current) => !current)}
            >
              {open ? <ChevronDown /> : <ChevronRight />}
            </Button>
          ) : null}
        </div>

        {hasChildren ? (
          <div className="border-t border-border/65 px-4 py-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {open
                  ? 'Direct reports shown in the order they sit under this branch.'
                  : 'Branch preview is collapsed. Expand to inspect full reporting lines.'}
              </p>
              <Badge variant="outline" className={cn(isActivePath && 'border-primary/20 text-primary')}>
                {node.children.length} report{node.children.length === 1 ? '' : 's'}
              </Badge>
            </div>

            {open ? (
              <div className="space-y-3">
                {branchChildren.length > 0 ? (
                  <div className={cn('grid gap-3', depth === 0 && 'xl:grid-cols-2')}>
                    {branchChildren.map((child) => (
                      <TreeBranchCard
                        key={child.id}
                        node={child}
                        depth={depth + 1}
                        selectedId={selectedId}
                        activePathIds={activePathIds}
                        searchActive={searchActive}
                        onSelect={onSelect}
                      />
                    ))}
                  </div>
                ) : null}

                {leafChildren.length > 0 ? (
                  <div
                    className={cn(
                      'grid gap-2',
                      depth === 0 ? 'sm:grid-cols-2 2xl:grid-cols-3' : 'sm:grid-cols-2',
                    )}
                  >
                    {leafChildren.map((child) => (
                      <LeafNodeCard
                        key={child.id}
                        node={child}
                        selected={child.id === selectedId}
                        onSelect={onSelect}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {node.children.slice(0, 6).map((child) => (
                  <MiniNodeChip
                    key={child.id}
                    node={child}
                    selected={child.id === selectedId}
                    onSelect={onSelect}
                  />
                ))}
                {node.children.length > 6 ? (
                  <Badge variant="outline">+{node.children.length - 6} more</Badge>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function RootLane({
  node,
  selectedId,
  activePathIds,
  searchActive,
  onSelect,
}: {
  node: OrgNode
  selectedId: number | null
  activePathIds: Set<number>
  searchActive: boolean
  onSelect: (id: number) => void
}) {
  const isSelected = node.id === selectedId
  const directLeaders = countDirectLeaders(node)
  const branchChildren = node.children.filter((child) => child.children.length > 0)
  const leafChildren = node.children.filter((child) => child.children.length === 0)

  return (
    <section className="space-y-4">
      <div
        className={cn(
          'surface-elevated relative overflow-hidden px-5 py-5 md:px-6',
          roleSurfaceTone(node.role),
          isSelected && 'ring-2 ring-primary/20 shadow-ios-card',
        )}
      >
        <div className="pointer-events-none absolute -right-12 top-0 size-36 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-10 bottom-0 size-28 rounded-full bg-accent/25 blur-3xl" />

        <div className="relative flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <button
            type="button"
            onClick={() => onSelect(node.id)}
            className="flex min-w-0 flex-1 items-start gap-4 text-left"
          >
            <NodeAvatar name={node.name} role={node.role} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <RolePill role={node.role} />
                <Badge variant="outline">Root lane</Badge>
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{node.name}</h2>
              <p className="mt-1 font-mono text-[0.74rem] text-muted-foreground">{node.fbo_id}</p>
              <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{nodeDescription(node)}</p>
            </div>
          </button>

          <div className="grid gap-3 sm:grid-cols-3 xl:w-[26rem]">
            <MetricTile
              label="Direct reports"
              value={node.children.length}
              hint="Immediate reporting seats"
              icon={<Users className="size-5" />}
            />
            <MetricTile
              label="Leaders"
              value={directLeaders}
              hint="Leadership nodes right below"
              icon={<GitBranch className="size-5" />}
            />
            <MetricTile
              label="Downline"
              value={node.team_size}
              hint="Members in this branch below root"
              icon={<Layers2 className="size-5" />}
            />
          </div>
        </div>

        {node.children.length > 0 ? (
          <div className="relative mt-5 flex flex-wrap gap-2">
            {node.children.slice(0, 8).map((child) => (
              <MiniNodeChip
                key={child.id}
                node={child}
                selected={child.id === selectedId}
                onSelect={onSelect}
              />
            ))}
            {node.children.length > 8 ? (
              <Badge variant="outline">+{node.children.length - 8} more nodes</Badge>
            ) : null}
          </div>
        ) : null}
      </div>

      {node.children.length > 0 ? (
        <div className="relative pl-4 before:absolute before:bottom-0 before:left-0 before:top-0 before:w-px before:bg-border/75">
          <div className="space-y-3">
            {branchChildren.length > 0 ? (
              <div className="grid gap-3 xl:grid-cols-2">
                {branchChildren.map((child) => (
                  <TreeBranchCard
                    key={child.id}
                    node={child}
                    depth={1}
                    selectedId={selectedId}
                    activePathIds={activePathIds}
                    searchActive={searchActive}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            ) : null}

            {leafChildren.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
                {leafChildren.map((child) => (
                  <LeafNodeCard
                    key={child.id}
                    node={child}
                    selected={child.id === selectedId}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function DirectoryRow({
  item,
  selected,
  onSelect,
}: {
  item: FlatNode
  selected: boolean
  onSelect: (id: number) => void
}) {
  const parent = item.path.length > 1 ? item.path[item.path.length - 2] : null

  return (
    <div style={{ paddingLeft: `${Math.min(item.depth, 5) * 0.85}rem` }}>
      <button
        type="button"
        onClick={() => onSelect(item.node.id)}
        className={cn(
          'surface-inset flex w-full items-center gap-3 px-3 py-3 text-left transition-colors',
          roleSurfaceTone(item.node.role),
          selected
            ? 'ring-2 ring-primary/20 shadow-ios-card'
            : 'hover:-translate-y-0.5 hover:border-primary/15 hover:bg-white/[0.58]',
        )}
      >
        <div className="flex items-center gap-3">
          {item.depth > 0 ? <span className="h-8 w-px rounded-full bg-border" /> : null}
          <NodeAvatar name={item.node.name} role={item.node.role} size="sm" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium text-foreground">{item.node.name}</p>
            <RolePill role={item.node.role} className="px-2 py-0.5 text-[0.58rem]" />
            {selected ? <Badge variant="outline">Focused</Badge> : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono">{item.node.fbo_id}</span>
            <span>{item.node.children.length} direct reports</span>
            <span>{item.node.team_size} downline</span>
            <span>{parent ? `Reports to ${parent.name}` : 'Top-level root'}</span>
          </div>
        </div>

        <div className="hidden shrink-0 text-right md:block">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Layer {item.depth + 1}
          </p>
          <p className="mt-1 max-w-[15rem] truncate text-xs text-foreground">{formatPath(item.path)}</p>
        </div>
      </button>
    </div>
  )
}

function DetailPanel({
  selected,
  onSelect,
}: {
  selected: FlatNode | null
  onSelect: (id: number) => void
}) {
  if (!selected) {
    return (
      <div className="surface-elevated sticky top-4 p-5">
        <EmptyState
          title="Pick a branch"
          description="Select a leader or member from the tree to inspect reporting depth, role mix, and direct reports."
          className="border-none bg-transparent px-0 py-8"
        />
      </div>
    )
  }

  const node = selected.node
  const parent = selected.path.length > 1 ? selected.path[selected.path.length - 2] : null
  const branchMix = getBranchMix(node)
  const branchTotal = branchMix.admin + branchMix.leader + branchMix.team
  const leadersBelow = countDescendantsByRole(node, 'leader')
  const teamBelow = countDescendantsByRole(node, 'team')
  const adminBelow = countDescendantsByRole(node, 'admin')

  return (
    <aside className="surface-elevated sticky top-4 overflow-hidden">
      <div className={cn('relative overflow-hidden p-5', roleSurfaceTone(node.role))}>
        <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-6 bottom-0 size-24 rounded-full bg-accent/20 blur-3xl" />

        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Focused branch</Badge>
            <RolePill role={node.role} />
          </div>

          <div className="mt-4 flex items-start gap-3">
            <NodeAvatar name={node.name} role={node.role} size="lg" />
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-xl font-semibold tracking-tight text-foreground">{node.name}</h3>
              <p className="mt-1 font-mono text-[0.74rem] text-muted-foreground">{node.fbo_id}</p>
              <p className="mt-3 text-sm text-muted-foreground">{nodeDescription(node)}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <StatChip label="Layer" value={selected.depth + 1} />
            <StatChip label="Branch size" value={branchTotal} tone="primary" />
            {parent ? <StatChip label="Reports to" value={parent.name} /> : null}
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricTile
            label="Direct reports"
            value={node.children.length}
            hint="Seats attached immediately below"
            icon={<Users className="size-5" />}
          />
          <MetricTile
            label="Downline"
            value={node.team_size}
            hint="People in this branch below current node"
            icon={<Layers2 className="size-5" />}
          />
          <MetricTile
            label="Leaders below"
            value={leadersBelow}
            hint="Nested leadership under this branch"
            icon={<GitBranch className="size-5" />}
          />
          <MetricTile
            label="Team below"
            value={teamBelow}
            hint="Individual contributors under this branch"
            icon={<User className="size-5" />}
          />
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Branch composition</p>
              <p className="text-xs text-muted-foreground">
                Split of admin, leader, and team seats inside the focused branch.
              </p>
            </div>
            <Badge variant="outline">{branchTotal} total</Badge>
          </div>
          <CompositionBar mix={branchMix} />
          {adminBelow > 0 ? <StatChip label="Admins below" value={adminBelow} tone="primary" /> : null}
        </section>

        <section className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Reporting line</p>
            <p className="text-xs text-muted-foreground">
              The path from root to the focused node.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {selected.path.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors',
                  item.id === node.id
                    ? 'border-primary/20 bg-primary/[0.08] text-primary'
                    : 'border-border bg-muted/45 text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                )}
              >
                <span>{item.name}</span>
                {index < selected.path.length - 1 ? <ChevronRight className="size-3" /> : null}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Direct reports</p>
              <p className="text-xs text-muted-foreground">
                Jump into any node directly attached under this branch.
              </p>
            </div>
            <Badge variant="outline">{node.children.length}</Badge>
          </div>

          {node.children.length > 0 ? (
            <div className="space-y-2">
              {node.children.map((child) => (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => onSelect(child.id)}
                  className={cn(
                    'surface-inset flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:border-primary/15 hover:bg-white/[0.58]',
                    roleSurfaceTone(child.role),
                  )}
                >
                  <NodeAvatar name={child.name} role={child.role} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium text-foreground">{child.name}</p>
                      <RolePill role={child.role} className="px-2 py-0.5 text-[0.58rem]" />
                    </div>
                    <p className="mt-1 truncate font-mono text-[0.68rem] text-muted-foreground">
                      {child.fbo_id}
                    </p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No direct reports"
              description="This node currently ends the chain, so there are no people attached underneath it."
              className="px-4 py-6"
            />
          )}
        </section>
      </div>
    </aside>
  )
}

export function SettingsOrgTreePage({ title }: Props) {
  const { data, isPending, isError, error, refetch } = useOrgTreeQuery({
    includeInactive: true,
  })

  const [query, setQuery] = useState('')
  const [view, setView] = useState('tree')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const deferredQuery = useDeferredValue(query)
  const needle = deferredQuery.trim().toLowerCase()

  const filteredTree = useMemo(() => filterTree(data?.items ?? [], needle), [data, needle])
  const allFlat = useMemo(() => flatten(data?.items ?? []), [data])
  const filteredFlat = useMemo(() => flatten(filteredTree), [filteredTree])
  const flatById = useMemo(
    () => new Map(allFlat.map((item) => [item.node.id, item])),
    [allFlat],
  )

  useEffect(() => {
    if (filteredFlat.length === 0) return
    const visible = selectedId !== null && filteredFlat.some((item) => item.node.id === selectedId)
    if (!visible) {
      setSelectedId(filteredFlat[0].node.id)
    }
  }, [filteredFlat, selectedId])

  const selected = useMemo(() => {
    if (selectedId !== null) {
      const byId = flatById.get(selectedId)
      if (byId) return byId
    }
    return filteredFlat[0] ?? allFlat[0] ?? null
  }, [allFlat, filteredFlat, flatById, selectedId])

  const activePathIds = useMemo(
    () => new Set(selected?.path.map((item) => item.id) ?? []),
    [selected],
  )

  const totalMembers = allFlat.length
  const adminCount = allFlat.filter((item) => item.node.role === 'admin').length
  const leaderCount = allFlat.filter((item) => item.node.role === 'leader').length
  const teamCount = allFlat.filter((item) => item.node.role === 'team').length
  const maxDepth = countMaxDepth(allFlat)
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

  const downloadCsv = useCallback(() => {
    const header = ['Member', 'Role', 'FBO ID', 'Team size', 'Depth', 'Path'].join(',')
    const body = allFlat
      .map((item) =>
        [
          item.node.name,
          item.node.role,
          item.node.fbo_id,
          item.node.team_size,
          item.depth + 1,
          formatPath(item.path),
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
  }, [allFlat])

  return (
    <div className="max-w-7xl space-y-5">
      <section className="surface-elevated relative overflow-hidden px-5 py-5 md:px-6 md:py-6">
        <div className="pointer-events-none absolute -left-20 top-0 size-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-0 size-48 rounded-full bg-accent/25 blur-3xl" />

        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl space-y-4">
            <Badge variant="primary" className="w-fit gap-1.5 px-3 py-1">
              <Network className="size-3.5" />
              Org Explorer
            </Badge>

            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                {title}
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
                Premium org tree for leadership lanes, reporting depth, and branch-by-branch inspection.
                Use it as a network map for admins and a clean hierarchy explorer for operational reviews.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <StatChip label="Tree-first" value="Hierarchy" tone="primary" />
              <StatChip label="Detail" value="Sticky panel" />
              <StatChip label="Alt view" value="Directory" tone="warning" />
              <StatChip label="Search" value="Path aware" tone="success" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:w-[32rem]">
            <MetricTile
              label="People mapped"
              value={totalMembers}
              hint={`${teamCount} members plus leadership seats`}
              icon={<Users className="size-5" />}
            />
            <MetricTile
              label="Leaders"
              value={leaderCount}
              hint={`${adminCount} admin root${adminCount === 1 ? '' : 's'} above them`}
              icon={<GitBranch className="size-5" />}
            />
            <MetricTile
              label="Depth"
              value={`${maxDepth} layer${maxDepth === 1 ? '' : 's'}`}
              hint="Deepest visible reporting chain"
              icon={<Layers2 className="size-5" />}
            />
            <MetricTile
              label="Largest branch"
              value={biggestBranch ? `+${biggestBranch.node.team_size}` : 0}
              hint={biggestBranch ? biggestBranch.node.name : 'No branch yet'}
              icon={<Building2 className="size-5" />}
            />
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

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Tabs value={view} onValueChange={setView}>
              <TabsList className="grid w-full grid-cols-2 sm:w-[16rem]">
                <TabsTrigger value="tree">Tree view</TabsTrigger>
                <TabsTrigger value="directory">Directory</TabsTrigger>
              </TabsList>
            </Tabs>

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
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <StatChip label="Admins" value={adminCount} tone="primary" />
          <StatChip label="Leaders" value={leaderCount} tone="warning" />
          <StatChip label="Team" value={teamCount} tone="success" />
          <StatChip
            label={searchActive ? 'Matches' : 'Visible'}
            value={filteredFlat.length}
          />
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
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_22rem]">
          <div className="space-y-5">
            {view === 'tree' ? (
              <div className="surface-elevated relative overflow-hidden p-4 md:p-5">
                <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent" />
                <div className="mb-4 flex items-center gap-3">
                  <div className="rounded-2xl border border-primary/20 bg-primary/[0.08] p-2 text-primary">
                    <Network className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Hierarchy tree</p>
                    <p className="text-xs text-muted-foreground">
                      Leaders are shown as expandable branches, while individual contributors stay compact.
                    </p>
                  </div>
                </div>

                {filteredTree.length > 0 ? (
                  <div className="space-y-5">
                    {filteredTree.map((root) => (
                      <RootLane
                        key={root.id}
                        node={root}
                        selectedId={selected?.node.id ?? null}
                        activePathIds={activePathIds}
                        searchActive={searchActive}
                        onSelect={setSelectedId}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No matching people"
                    description="Try a different name, FBO ID, or role. The tree filters recursively, so parent branches only stay visible when something below matches."
                  />
                )}
              </div>
            ) : null}

            {view === 'directory' ? (
              <div className="surface-elevated p-4 md:p-5">
                <div className="mb-4 flex items-center gap-3">
                  <div className="rounded-2xl border border-primary/20 bg-primary/[0.08] p-2 text-primary">
                    <Layers2 className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Directory view</p>
                    <p className="text-xs text-muted-foreground">
                      Faster for scanning every seat in the network with depth and reporting context inline.
                    </p>
                  </div>
                </div>

                {filteredFlat.length > 0 ? (
                  <div className="space-y-2">
                    {filteredFlat.map((item) => (
                      <DirectoryRow
                        key={item.node.id}
                        item={item}
                        selected={item.node.id === selected?.node.id}
                        onSelect={setSelectedId}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No matching people"
                    description="Clear the search or try a broader term to inspect the directory."
                  />
                )}
              </div>
            ) : null}
          </div>

          <DetailPanel selected={selected} onSelect={setSelectedId} />
        </div>
      ) : null}
    </div>
  )
}
