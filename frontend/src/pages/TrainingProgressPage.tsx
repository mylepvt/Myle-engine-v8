import { useDeferredValue, useMemo, useState } from 'react'
import { GraduationCap, Lock, LockOpen, RotateCcw, Users } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ListSearchInput } from '@/components/ui/list-search-input'
import { ErrorState, LoadingState } from '@/components/ui/states'
import {
  useResetTrainingMutation,
  useToggleTrainingRequirementMutation,
  useTrainingOverviewQuery,
  type TrainingProgressGroup,
  type TrainingProgressMember,
} from '@/hooks/use-training-overview-query'
import { filterCollectionByQuery, type SearchableValue } from '@/lib/search-filter'
import { cn } from '@/lib/utils'

type Props = { title: string }

type StatusInfo = {
  label: string
  variant: 'success' | 'warning' | 'danger' | 'primary' | 'secondary'
}

function memberStatus(m: TrainingProgressMember): StatusInfo {
  if (!m.training_required) return { label: 'No training', variant: 'secondary' }
  const allDays = m.days_done >= m.total_days
  if (allDays && m.test?.passed) return { label: 'Done', variant: 'success' }
  if (allDays) return { label: 'Test pending', variant: 'primary' }
  if (m.days_done > 0) return { label: 'In progress', variant: 'warning' }
  return { label: 'Not started', variant: 'danger' }
}

function memberSearchValues(m: TrainingProgressMember): SearchableValue[] {
  return [m.name, m.fbo_id, m.role]
}

function MemberRow({ member }: { member: TrainingProgressMember }) {
  const toggle = useToggleTrainingRequirementMutation()
  const reset = useResetTrainingMutation()
  const status = memberStatus(member)
  const percent = member.total_days > 0 ? Math.round((member.days_done / member.total_days) * 100) : 0
  const busy = toggle.isPending || reset.isPending

  return (
    <tr className="border-t border-border">
      <td className="py-3 pl-3 pr-2">
        <p className="font-medium text-foreground">{member.name}</p>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">{member.fbo_id}</p>
      </td>
      <td className="px-2 py-3 text-xs text-muted-foreground">{member.joining_date ?? '—'}</td>
      <td className="px-2 py-3" style={{ minWidth: 160 }}>
        {member.training_required ? (
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)]">
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width] duration-300 dark:bg-emerald-400"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              {member.days_done}/{member.total_days}
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-2 py-3 text-sm">
        {member.test ? (
          <Badge variant={member.test.passed ? 'success' : 'danger'}>
            {member.test.percent}%
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-2 py-3">
        <Badge variant={status.variant}>{status.label}</Badge>
        {member.has_certificate ? (
          <Badge variant="success" className="ml-1.5">
            Certificate
          </Badge>
        ) : null}
      </td>
      <td className="py-3 pl-2 pr-3 text-right">
        <div className="flex justify-end gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            title={
              member.training_required
                ? 'Remove training lock (grant full access)'
                : 'Require training (lock access until done)'
            }
            onClick={() => {
              const msg = member.training_required
                ? `Remove training requirement for ${member.name}?`
                : `Require training for ${member.name}?`
              if (window.confirm(msg)) toggle.mutate(member.user_id)
            }}
          >
            {member.training_required ? <LockOpen className="size-3.5" /> : <Lock className="size-3.5" />}
          </Button>
          {member.training_required && member.days_done > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              title="Reset training progress + test"
              onClick={() => {
                if (
                  window.confirm(
                    `Reset ALL training progress and test for ${member.name}? This cannot be undone.`,
                  )
                )
                  reset.mutate(member.user_id)
              }}
            >
              <RotateCcw className="size-3.5" />
            </Button>
          ) : null}
        </div>
      </td>
    </tr>
  )
}

function GroupCard({ group }: { group: TrainingProgressGroup }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-primary" />
          <span className="font-semibold text-foreground">{group.leader_name}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Badge variant="secondary">{group.member_count} members</Badge>
          <Badge variant="success">{group.completed_count} done</Badge>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="py-2 pl-3 pr-2 font-medium">Member</th>
              <th className="px-2 py-2 font-medium">Joined</th>
              <th className="px-2 py-2 font-medium">Progress</th>
              <th className="px-2 py-2 font-medium">Test</th>
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="py-2 pl-2 pr-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {group.members.map((m) => (
              <MemberRow key={m.user_id} member={m} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

export function TrainingProgressPage({ title }: Props) {
  const { data, isPending, isError, error, refetch } = useTrainingOverviewQuery()
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)

  const filteredGroups = useMemo(() => {
    if (!data) return []
    return data.groups
      .map((group) => ({
        ...group,
        members: filterCollectionByQuery(group.members, deferredSearch, memberSearchValues),
      }))
      .filter((group) => group.members.length > 0)
  }, [data, deferredSearch])

  return (
    <div className="max-w-6xl space-y-5">
      <Card className="px-5 py-5 md:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <Badge variant="primary" className="w-fit gap-1.5 px-3 py-1">
              <GraduationCap className="size-3.5" />
              Training
            </Badge>
            <h1 className="text-ds-h1">{title}</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Har team manager ke neeche members ki 7-din training kitni puri hui — progress, test
              aur status. Lock toggle se training required on/off, reset se dobara shuru.
            </p>
          </div>
          {data ? (
            <Badge variant="secondary" className="shrink-0">
              {data.total_members} members
            </Badge>
          ) : null}
        </div>
      </Card>

      <ListSearchInput
        value={search}
        onValueChange={setSearch}
        placeholder="Search member, FBO ID, role"
        aria-label="Search members"
        wrapperClassName="w-full max-w-md"
      />

      {isPending ? (
        <Card className="p-4">
          <LoadingState label="Loading training progress..." />
        </Card>
      ) : null}

      {isError ? (
        <ErrorState
          title="Could not load training progress"
          message={error instanceof Error ? error.message : 'Please try again.'}
          onRetry={() => void refetch()}
        />
      ) : null}

      {data && filteredGroups.length === 0 ? (
        <Card className="px-5 py-10 text-center text-sm text-muted-foreground">
          {data.groups.length === 0
            ? 'No members in training yet.'
            : 'No members match your search.'}
        </Card>
      ) : null}

      <div className={cn('space-y-4')}>
        {filteredGroups.map((group) => (
          <GroupCard key={group.leader_user_id ?? 'unassigned'} group={group} />
        ))}
      </div>
    </div>
  )
}
