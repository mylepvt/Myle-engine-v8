import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, GitBranch, LayoutList, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { useOrgTreeQuery, type OrgTreeNode } from '@/hooks/use-org-tree-query'
import { useMyTeamQuery, type TeamMemberPublic } from '@/hooks/use-team-query'
import { cn } from '@/lib/utils'

type Props = { title: string }

function roleLabel(role: string): string {
  if (role === 'team') return 'Member'
  if (role === 'leader') return 'Leader'
  if (role === 'admin') return 'Admin'
  return role
}

function roleBadgeVariant(role: string): 'warning' | 'primary' | 'success' | 'outline' {
  if (role === 'admin') return 'warning'
  if (role === 'leader') return 'primary'
  if (role === 'team') return 'success'
  return 'outline'
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'U'
  )
}

function avatarTone(role: string): string {
  if (role === 'admin') return 'bg-amber-400/15 text-amber-300 border border-amber-400/20'
  if (role === 'leader') return 'bg-primary/15 text-primary border border-primary/20'
  return 'bg-emerald-400/15 text-emerald-300 border border-emerald-400/20'
}

function OrgBranch({ node, depth }: { node: OrgTreeNode; depth: number }) {
  const [open, setOpen] = useState(depth < 1)
  const hasChildren = node.children.length > 0

  return (
    <div className={cn('min-w-0 space-y-2', depth > 0 ? 'ml-4 border-l border-white/10 pl-3' : '')}>
      <button
        type="button"
        onClick={() => hasChildren && setOpen((o) => !o)}
        className={cn(
          'surface-inset w-full min-w-0 rounded-xl px-3 py-3 text-left transition-colors',
          hasChildren ? 'hover:border-primary/25 hover:bg-white/[0.05]' : 'cursor-default',
        )}
      >
        <div className="flex items-start gap-3">
          <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold', avatarTone(node.role))}>
            {initials(node.name)}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-semibold text-foreground">{node.name}</p>
              <Badge variant={roleBadgeVariant(node.role)}>{roleLabel(node.role)}</Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono">{node.fbo_id}</span>
              <span>
                {hasChildren
                  ? `${node.children.length} direct report${node.children.length === 1 ? '' : 's'}`
                  : 'No direct reports'}
              </span>
            </div>
          </div>

          {hasChildren ? (
            <div className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] p-1 text-muted-foreground">
              {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </div>
          ) : null}
        </div>
      </button>

      {hasChildren && open ? (
        <div className="space-y-2">
          {node.children.map((child) => (
            <OrgBranch key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function TeamListItem({ member }: { member: TeamMemberPublic }) {
  const displayName = member.username || member.name || member.fbo_id

  return (
    <li className="surface-inset min-w-0 rounded-xl px-3 py-3">
      <div className="flex items-start gap-3">
        <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold', avatarTone(member.role))}>
          {initials(displayName)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-foreground">{displayName}</p>
            <Badge variant={roleBadgeVariant(member.role)}>{roleLabel(member.role)}</Badge>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{member.email}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono">{member.fbo_id}</span>
            {member.upline_name ? (
              <span>
                Reports to {member.upline_name}
                {member.upline_fbo_id ? ` (${member.upline_fbo_id})` : ''}
              </span>
            ) : null}
            <span>Joined {new Date(member.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      </div>
    </li>
  )
}

export function MyTeamPage({ title }: Props) {
  const { data: me } = useAuthMeQuery()
  const { data, isPending, isError, error, refetch } = useMyTeamQuery()
  const org = useOrgTreeQuery({
    includeInactive: false,
    enabled: Boolean(me?.authenticated) && (me?.role === 'leader' || me?.role === 'team'),
  })

  const isLeader = me?.role === 'leader'
  const root = org.data?.items?.[0]
  const initialLoading = (!data && isPending) || (!root && org.isPending)

  return (
    <div className="max-w-5xl space-y-5 overflow-x-hidden">
      <div className="surface-elevated overflow-hidden p-5 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <Badge variant="primary" className="w-fit gap-1.5 px-3 py-1">
              <GitBranch className="size-3.5" />
              My team
            </Badge>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {isLeader
                  ? 'See everyone under you, open the team map, and quickly check who reports to whom.'
                  : 'See your details, who you report to, and where you sit in the team structure.'}
              </p>
            </div>
          </div>

          <Button asChild variant="outline">
            <Link to="/dashboard/work/leads">Open work list</Link>
          </Button>
        </div>

        {isLeader && data ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="surface-inset rounded-xl px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">People under you</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{data.total_downline ?? 0}</p>
            </div>
            <div className="surface-inset rounded-xl px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Direct reports</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{data.direct_members ?? 0}</p>
            </div>
            <div className="surface-inset rounded-xl px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Shown here</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{data.total}</p>
            </div>
          </div>
        ) : null}
      </div>

      {initialLoading ? (
        <div className="surface-elevated p-4">
          <LoadingState label="Loading your team..." />
        </div>
      ) : null}

      {!initialLoading ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
          <section className="surface-elevated p-4 md:p-5">
            <div className="mb-4 flex items-center gap-2">
              <div className="rounded-xl border border-primary/20 bg-primary/[0.08] p-2 text-primary">
                <Users className="size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Team map</p>
                <p className="text-xs text-muted-foreground">Open each branch to see people below it.</p>
              </div>
            </div>

            {org.isError ? (
              <ErrorState
                title="Could not load the team map"
                message={org.error instanceof Error ? org.error.message : 'Please try again.'}
                onRetry={() => void org.refetch()}
              />
            ) : root ? (
              <OrgBranch node={root} depth={0} />
            ) : (
              <EmptyState
                title="No team map yet"
                description="Your reporting structure will appear here once members are linked."
              />
            )}
          </section>

          <section className="surface-elevated p-4 md:p-5">
            <div className="mb-4 flex items-center gap-2">
              <div className="rounded-xl border border-primary/20 bg-primary/[0.08] p-2 text-primary">
                <LayoutList className="size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Team list</p>
                <p className="text-xs text-muted-foreground">A quick list of everyone shown on this page.</p>
              </div>
            </div>

            {isError ? (
              <ErrorState
                title="Could not load your team list"
                message={error instanceof Error ? error.message : 'Please try again.'}
                onRetry={() => void refetch()}
              />
            ) : data?.items?.length ? (
              <ul className="space-y-2">
                {data.items.map((member) => (
                  <TeamListItem key={member.id} member={member} />
                ))}
              </ul>
            ) : (
              <EmptyState
                title={isLeader ? 'No team members yet' : 'Your details will show here'}
                description={
                  isLeader
                    ? 'Once people join under you, they will appear here automatically.'
                    : 'You will see your profile details here when the team list is ready.'
                }
              />
            )}
          </section>
        </div>
      ) : null}
    </div>
  )
}
