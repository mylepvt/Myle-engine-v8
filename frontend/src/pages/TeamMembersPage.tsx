import { useDeferredValue, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ListSearchInput } from '@/components/ui/list-search-input'
import { Skeleton } from '@/components/ui/skeleton'
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
import {
  useTeamMembersQuery,
  type TeamMemberPublic,
} from '@/hooks/use-team-query'
import { directorySearchValues, filterCollectionByQuery } from '@/lib/search-filter'

type Props = { title: string }

export function TeamMembersPage({ title }: Props) {
  const { data: me } = useAuthMeQuery()
  const isAdmin = me?.authenticated && me.role === 'admin'
  const isAdminOrLeader =
    me?.authenticated && (me.role === 'admin' || me.role === 'leader')
  const { data, isPending, isError, error, refetch } = useTeamMembersQuery()

  const [memberQuery, setMemberQuery] = useState('')

  const [resetTarget, setResetTarget] = useState<ResetTarget | null>(null)
  const [profileTarget, setProfileTarget] = useState<TeamMemberPublic | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const deferredMemberQuery = useDeferredValue(memberQuery)
  const searchActive = memberQuery.trim().length > 0
  const filteredMembers = data
    ? filterCollectionByQuery(data.items, deferredMemberQuery, (member) => directorySearchValues(member))
    : []

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
      <div className="space-y-2">
        <Badge variant="primary" className="w-fit px-3 py-1">
          Member directory
        </Badge>
        <h1 className="text-ds-h1">{title}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          All accounts in this environment from the users table. Passwords are never exposed through this API.
        </p>
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
        <div className="surface-elevated min-w-0 overflow-hidden p-4 text-sm sm:p-5 md:p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium text-foreground">Total: {data.total}</p>
              <p className="mt-1 text-ds-caption text-muted-foreground">
                Responsive member cards with wrapped details and quick actions.
              </p>
            </div>
          </div>
          <div className="mb-5 flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <ListSearchInput
              value={memberQuery}
              onValueChange={setMemberQuery}
              placeholder="Search by FBO ID, username, email, role, upline, or compliance"
              aria-label="Search members"
              wrapperClassName="w-full lg:max-w-md"
            />
            <p className="min-w-0 text-ds-caption text-muted-foreground">
              {searchActive
                ? `Showing ${filteredMembers.length} of ${data.total} members.`
                : 'Search works across FBO ID, username, email, role, and upline.'}
            </p>
          </div>

          {filteredMembers.length ? (
            <ul className="space-y-3 overflow-x-hidden">
              {filteredMembers.map((m) => (
                <li
                  key={m.id}
                  className="surface-inset min-w-0 overflow-hidden rounded-md border border-border dark:border-white/5 px-4 py-3 text-muted-foreground shadow-[inset_0_1px_0_color-mix(in_srgb,var(--foreground)_5%,transparent)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="break-all text-sm font-semibold text-foreground sm:text-[0.95rem]">
                              {m.fbo_id}
                            </span>
                            <Badge variant={memberRoleBadgeVariant(m.role)} className="shrink-0">
                              {memberRoleLabel(m.role)}
                            </Badge>
                          </div>
                          {m.username ? (
                            <p className="mt-1 break-words text-ds-caption text-muted-foreground">
                              {m.username}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-2 grid gap-1.5 text-ds-caption text-muted-foreground">
                        <p className="break-all">{m.email}</p>
                        <p>Joined {formatMemberTimestamp(m.created_at)}</p>
                        {(m.upline_name || m.upline_fbo_id) ? (
                          <p className="break-words">
                            Upline: <span className="text-foreground">{m.upline_name ?? m.upline_fbo_id}</span>
                            {m.upline_name && m.upline_fbo_id ? (
                              <span className="ml-1 font-mono opacity-70">({m.upline_fbo_id})</span>
                            ) : null}
                          </p>
                        ) : null}
                        {m.compliance_title && m.compliance_level !== 'not_applicable' ? (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Badge variant={complianceBadgeVariant(m.compliance_level)}>
                              {m.compliance_title}
                            </Badge>
                            {m.grace_end_date ? (
                              <span className="text-[0.68rem] text-muted-foreground">
                                Grace till {formatMemberDate(m.grace_end_date)}
                              </span>
                            ) : null}
                            {m.grace_request_end_date ? (
                              <span className="text-[0.68rem] text-primary">
                                Request till {formatMemberDate(m.grace_request_end_date)}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                        {!m.compliance_title && m.grace_request_end_date ? (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="text-[0.68rem] text-primary">
                              Request till {formatMemberDate(m.grace_request_end_date)}
                            </span>
                          </div>
                        ) : null}
                        {m.compliance_summary && m.compliance_level !== 'not_applicable' ? (
                          <p className={`text-[0.7rem] ${complianceTone(m.compliance_level)}`}>
                            {m.compliance_summary}
                          </p>
                        ) : null}
                        {m.grace_request_end_date && m.grace_request_reason ? (
                          <p className="text-[0.7rem] text-muted-foreground">{m.grace_request_reason}</p>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:min-w-[10.5rem]">
                      {isAdmin ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setProfileTarget(m)}
                          className="w-full justify-center border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                        >
                          Open Control Center
                        </Button>
                      ) : null}
                      {isAdminOrLeader ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setResetTarget({ id: m.id, fbo_id: m.fbo_id, email: m.email })}
                          className="w-full justify-center bg-muted/30 text-muted-foreground hover:bg-muted"
                        >
                          Reset Password
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="surface-inset rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              {searchActive
                ? 'No members match this search yet. Try a broader FBO ID, email, or username.'
                : 'No members found in this environment yet.'}
            </div>
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
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] right-4 z-[85] max-w-[min(22rem,calc(100vw-2rem))] rounded-md border border-emerald-500/35 bg-emerald-500/15 px-3 py-2 text-ds-caption font-semibold text-emerald-600 dark:text-emerald-200 shadow-lg">
          {toastMsg}
        </div>
      ) : null}
    </div>
  )
}
