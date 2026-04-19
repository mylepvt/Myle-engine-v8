import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, Users } from 'lucide-react'

import { Skeleton } from '@/components/ui/skeleton'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { useOrgTreeQuery, type OrgTreeNode } from '@/hooks/use-org-tree-query'
import { useMyTeamQuery } from '@/hooks/use-team-query'
import { cn } from '@/lib/utils'

type Props = { title: string }

function OrgBranch({ node, depth }: { node: OrgTreeNode; depth: number }) {
  const [open, setOpen] = useState(depth < 2)
  const hasChildren = node.children.length > 0

  return (
    <div className={cn('min-w-0', depth > 0 ? 'ml-3 border-l border-white/10 pl-2' : '')}>
      <button
        type="button"
        onClick={() => hasChildren && setOpen((o) => !o)}
        className={cn(
          'flex w-full min-w-0 items-center gap-2 rounded-md py-1.5 text-left text-sm',
          hasChildren ? 'text-foreground hover:bg-white/[0.04]' : 'text-muted-foreground',
        )}
      >
        {hasChildren ? (
          <span className="shrink-0 text-muted-foreground">
            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </span>
        ) : (
          <span className="inline-block w-4 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate font-medium">{node.name}</span>
        <span className="shrink-0 font-mono text-[0.65rem] text-muted-foreground/80">{node.fbo_id}</span>
        <span className="shrink-0 rounded-full border border-white/10 px-1.5 py-0.5 text-[0.58rem] uppercase text-muted-foreground">
          {node.role}
        </span>
      </button>
      {hasChildren && open ? (
        <div className="space-y-0.5 pb-1">
          {node.children.map((c) => (
            <OrgBranch key={c.id} node={c} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
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

  return (
    <div className="max-w-2xl space-y-6 overflow-x-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        <Link
          to="/dashboard/work/leads"
          className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Work
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        {isLeader
          ? 'Your organisation: everyone in your downline. Admins can change placement in Team → Members.'
          : 'Your profile and upline. Team leaders manage downline from My team.'}
      </p>

      {isLeader && data ? (
        <div className="surface-elevated flex flex-wrap gap-4 p-4 text-sm">
          <div className="flex min-w-[8rem] items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Total downline</p>
              <p className="font-semibold text-foreground">{data.total_downline ?? 0}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Direct members</p>
            <p className="font-semibold text-foreground">{data.direct_members ?? 0}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">In this list</p>
            <p className="font-semibold text-foreground">{data.total}</p>
          </div>
        </div>
      ) : null}

      {isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
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

      {org.isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}
      {org.isError ? (
        <p className="text-xs text-destructive">
          {org.error instanceof Error ? org.error.message : 'Could not load org tree'}
        </p>
      ) : null}

      {root ? (
        <div className="surface-elevated p-4 text-sm">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Org tree</p>
          <OrgBranch node={root} depth={0} />
        </div>
      ) : null}

      {data ? (
        <div className="surface-elevated p-4 text-sm">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Directory</p>
          <ul className="space-y-2">
            {data.items.map((m) => (
              <li key={m.id} className="surface-inset min-w-0 px-3 py-2 text-muted-foreground">
                <span className="font-medium text-foreground">{m.fbo_id}</span>
                {m.username ? (
                  <span className="text-muted-foreground"> · {m.username}</span>
                ) : null}
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{m.email}</span>
                {m.upline_name ? (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Upline: {m.upline_name}
                    {m.upline_fbo_id ? ` (${m.upline_fbo_id})` : ''}
                  </span>
                ) : null}
                <span className="mt-0.5 block text-xs">
                  {m.role} · joined {new Date(m.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
