import { useDeferredValue, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Users } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ListSearchInput } from '@/components/ui/list-search-input'
import { Skeleton } from '@/components/ui/skeleton'
import { InlineEmpty } from '@/components/ui/states'
import { MemberProfileModal } from '@/components/team/member-profile-modal'
import { ResetPasswordModal } from '@/components/team/reset-password-modal'
import {
  memberRoleBadgeVariant,
  memberRoleLabel,
  formatMemberDate,
  formatMemberTimestamp,
  complianceBadgeVariant,
  complianceTone,
  type ResetTarget,
} from '@/components/team/member-utils'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { useBackClose } from '@/hooks/use-back-close'
import {
  useTeamMembersQuery,
  type TeamMemberPublic,
} from '@/hooks/use-team-query'
import { directorySearchValues, filterCollectionByQuery } from '@/lib/search-filter'
import { personName } from '@/lib/utils'

type Props = { title: string }

export function TeamMembersPage({ title }: Props) {
  const { data: me } = useAuthMeQuery()
  const isAdmin = me?.authenticated && me.role === 'admin'
  const isAdminOrLeader =
    me?.authenticated && (me.role === 'admin' || me.role === 'leader')
  const { data, isPending, isError, error, refetch } = useTeamMembersQuery()

  const [searchParams, setSearchParams] = useSearchParams()
  const graceFilter = searchParams.get('grace') === '1'

  const [memberQuery, setMemberQuery] = useState('')

  const [resetTarget, setResetTarget] = useState<ResetTarget | null>(null)
  const [profileTarget, setProfileTarget] = useState<TeamMemberPublic | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  useBackClose({ open: !!profileTarget, onClose: () => setProfileTarget(null) })
  useBackClose({ open: !!resetTarget, onClose: () => setResetTarget(null) })
  const deferredMemberQuery = useDeferredValue(memberQuery)
  const searchActive = memberQuery.trim().length > 0
  const filteredByQuery = data
    ? filterCollectionByQuery(data.items, deferredMemberQuery, (member) => directorySearchValues(member))
    : []
  const filteredMembers = graceFilter
    ? filteredByQuery.filter((m) => m.grace_request_end_date != null)
    : filteredByQuery
  const graceCount = graceFilter ? filteredMembers.length : (data?.items ?? []).filter((m) => m.grace_request_end_date != null).length

  useEffect(() => {
    if (!toastMsg) return
    const id = window.setTimeout(() => setToastMsg(null), 2500)
    return () => window.clearTimeout(id)
  }, [toastMsg])

  return (
    <div className="min-w-0 max-w-4xl space-y-5 overflow-x-hidden pb-[max(6rem,calc(env(safe-area-inset-bottom)+5rem))]">
      <Link to="/dashboard/settings/app" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        ← Settings
      </Link>
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-ds-h1">{title}</h1>
        {data ? <span className="text-ds-caption tabular-nums text-muted-foreground">{data.total} people</span> : null}
      </div>

      {isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : null}
      {isError ? (
        <div className="text-sm text-destructive" role="alert">
          <span>{error instanceof Error ? error.message : 'Could not load members'} </span>
          <button type="button" className="underline underline-offset-2" onClick={() => void refetch()}>Retry</button>
        </div>
      ) : null}
      {data ? (
        <div className="min-w-0 space-y-4">
          {graceFilter ? (
            <div>
              {graceFilter ? (
                <p className="mt-1 text-ds-caption text-primary">
                  Showing {graceCount} grace request{graceCount !== 1 ? 's' : ''} —
                  <button type="button" onClick={() => setSearchParams({})} className="ml-1 underline underline-offset-2 hover:text-primary/80">
                    Clear filter
                  </button>
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <ListSearchInput
              value={memberQuery}
              onValueChange={setMemberQuery}
              placeholder="Search name, FBO ID, email or upline"
              aria-label="Search members"
              wrapperClassName="w-full lg:max-w-md"
            />
            {searchActive ? (
              <p className="min-w-0 text-ds-caption text-muted-foreground">
                {filteredMembers.length} of {data.total}
              </p>
            ) : null}
          </div>

          {filteredMembers.length ? (
            <ul className="space-y-3 overflow-x-hidden">
              {filteredMembers.map((m) => (
                <li key={m.id} className="min-w-0 overflow-hidden rounded-xl border border-border bg-card px-4 py-3.5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-ds-body font-semibold text-foreground">
                          {personName(m.username) || m.fbo_id}
                        </span>
                        <Badge variant={memberRoleBadgeVariant(m.role)} className="shrink-0">
                          {memberRoleLabel(m.role)}
                        </Badge>
                      </div>
                      <p className="mt-0.5 truncate text-ds-caption text-muted-foreground">
                        {m.fbo_id} · {m.email}
                      </p>
                      <div className="mt-2 grid gap-1.5 text-ds-caption text-muted-foreground">
                        <p className="truncate">
                          Joined {formatMemberTimestamp(m.created_at)}
                          {m.upline_name || m.upline_fbo_id ? (
                            <>
                              {' · '}Upline <span className="text-foreground">{personName(m.upline_name) || m.upline_fbo_id}</span>
                            </>
                          ) : null}
                        </p>
                        {m.compliance_title && m.compliance_level !== 'not_applicable' && m.compliance_level !== 'clear' ? (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Badge variant={complianceBadgeVariant(m.compliance_level)}>
                              {m.compliance_title}
                            </Badge>
                            {m.grace_end_date ? (
                              <span className="text-ds-micro text-muted-foreground">
                                Grace till {formatMemberDate(m.grace_end_date)}
                              </span>
                            ) : null}
                            {m.grace_request_end_date ? (
                              <span className="text-ds-micro text-primary">
                                Request till {formatMemberDate(m.grace_request_end_date)}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                        {!m.compliance_title && m.grace_request_end_date ? (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="text-ds-micro text-primary">
                              Request till {formatMemberDate(m.grace_request_end_date)}
                            </span>
                          </div>
                        ) : null}
                        {m.compliance_summary && m.compliance_level !== 'not_applicable' && m.compliance_level !== 'clear' ? (
                          <p className={`text-ds-micro ${complianceTone(m.compliance_level)}`}>
                            {m.compliance_summary}
                          </p>
                        ) : null}
                        {m.grace_request_end_date && m.grace_request_reason ? (
                          <p className="text-ds-micro text-muted-foreground">{m.grace_request_reason}</p>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex w-full shrink-0 gap-2 sm:w-auto sm:flex-col">
                      {isAdmin ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setProfileTarget(m)}
                          className="h-9 flex-1 justify-center border-transparent bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                        >
                          Open profile
                        </Button>
                      ) : null}
                      {isAdminOrLeader ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setResetTarget({ id: m.id, fbo_id: m.fbo_id, email: m.email })}
                          className="h-9 flex-1 justify-center border-transparent bg-muted text-muted-foreground hover:text-foreground"
                        >
                          Reset password
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <InlineEmpty icon={Users}>{searchActive ? 'Nobody matches this search.' : 'No members yet.'}</InlineEmpty>
          )}
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
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] right-4 z-[85] max-w-[min(22rem,calc(100vw-2rem))] rounded-md border border-success/35 bg-success/15 px-3 py-2 text-ds-caption font-semibold text-success-ink shadow-lg">
          {toastMsg}
        </div>
      ) : null}
    </div>
  )
}
