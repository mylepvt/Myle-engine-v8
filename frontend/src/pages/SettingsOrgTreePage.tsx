import { useEffect, useMemo, useState } from 'react'

import { MemberProfileModal } from '@/components/team/member-profile-modal'
import { ResetPasswordModal } from '@/components/team/reset-password-modal'
import { type ResetTarget } from '@/components/team/member-utils'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { useOrgTreeQuery, type OrgTreeNode } from '@/hooks/use-org-tree-query'
import { useTeamMembersQuery, type TeamMemberPublic } from '@/hooks/use-team-query'

type Props = { title: string }

type FlatNode = {
  node: OrgTreeNode
  depth: number
  path: OrgTreeNode[]
}

type HandoffColumn = {
  leader: FlatNode
  members: FlatNode[]
}

const C = {
  bg: '#0b0f14',
  panel: '#121922',
  card: '#0f151d',
  border: '#1f2a36',
  txt: '#e6edf3',
  mut: '#8b9aab',
  mut2: '#5e6e7e',
  leader: '#f5a524',
  team: '#3fb950',
  admin: '#6e8bff',
  bad: '#f85149',
  badbg: '#1c1012',
} as const

const MAX_CARD = 6

function flatten(nodes: OrgTreeNode[], depth = 0, path: OrgTreeNode[] = []): FlatNode[] {
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

  const allFlat = useMemo(() => flatten(data?.items ?? []), [data])
  const topLeaderIds = useMemo(
    () => new Set(data?.items.map((n) => n.id) ?? []),
    [data],
  )

  const { columns, unassigned } = useMemo(
    () => buildHandoffData(allFlat),
    [allFlat],
  )

  const hasData = columns.length > 0 || unassigned.length > 0

  return (
    <div style={{ background: C.bg, color: C.txt, font: '14px/1.45 -apple-system,Segoe UI,Roboto,sans-serif', minHeight: '100dvh' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 18px' }}>

        <h1 style={{ fontSize: 18, margin: '0 0 2px', fontWeight: 600 }}>{title}</h1>
        <p style={{ color: C.mut, fontSize: 12.5, margin: '0 0 18px' }}>
          Each column is a leader. The cards are the people whose leads actually land on that
          leader&rsquo;s board. The red column is where handoffs are falling through.
        </p>

        {isPending ? (
          <p style={{ color: C.mut2, fontSize: 13 }}>Loading organisation map&hellip;</p>
        ) : null}

        {isError ? (
          <div>
            <p style={{ color: C.bad, fontSize: 13 }}>
              {error instanceof Error ? error.message : 'Could not load the organisation tree'}
            </p>
            <button onClick={() => void refetch()} style={btnStyle}>Retry</button>
          </div>
        ) : null}

        {!isPending && !isError && !hasData ? (
          <p style={{ color: C.mut2, fontSize: 13 }}>No handoff data yet.</p>
        ) : null}

        {!isPending && !isError && hasData ? (
          <>
            <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 8 }}>
              {columns.map((col) => {
                const leader = col.leader
                const isTopLeader = topLeaderIds.has(leader.node.id)
                const count = col.members.length
                const showMore = count > MAX_CARD
                const visibleCards = showMore ? col.members.slice(0, MAX_CARD) : col.members

                return (
                  <div key={leader.node.id} style={colStyle}>
                    <div style={chStyle}>
                      <div style={{ ...avStyle, background: '#f5a524', color: '#1a1206' }}>
                        {initials(leader.node.name)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{leader.node.name}</div>
                        <div style={{ color: C.mut2, fontSize: 11 }}>
                          Leader{!isTopLeader ? ' · under a member ⚠' : ''}
                        </div>
                      </div>
                      <span style={cntStyle}>{count}</span>
                    </div>

                    <div style={bodyStyle}>
                      {visibleCards.map((item) => (
                        <button
                          key={item.node.id}
                          type="button"
                          onClick={() => {
                            setSelectedId(item.node.id)
                            handleCardClick(item.node)
                          }}
                          style={{
                            ...cardStyle,
                            ...(item.node.id === selectedId ? cardSelectedStyle : {}),
                          }}
                        >
                          <span style={{
                            ...dotStyle,
                            background: item.node.role === 'leader' ? C.leader : C.team,
                          }} />
                          <span style={{ fontSize: 12.5 }}>{item.node.name}</span>
                          {item.node.children.length > 0 && item.node.role === 'leader' ? (
                            <span style={{ marginLeft: 'auto', fontSize: 10, color: C.mut2 }}>
                              +{item.node.children.length} sub
                            </span>
                          ) : null}
                        </button>
                      ))}
                      {showMore ? (
                        <div style={{ ...cardStyle, cursor: 'default', opacity: 0.6 }}>
                          <span style={{ fontSize: 12.5 }}>&hellip;{count - MAX_CARD} more</span>
                        </div>
                      ) : null}
                    </div>

                    {!isTopLeader ? (
                      <div style={noteStyle}>
                        Sits under{' '}
                        {leader.path.length > 1
                          ? leader.path[leader.path.length - 2]?.name ?? 'root'
                          : 'root'}
                        . Works, but move under a top leader to clean up.
                      </div>
                    ) : null}
                  </div>
                )
              })}

              {unassigned.length > 0 ? (
                <div style={{ ...colStyle, borderColor: '#5a2226', background: '#140d0e' }}>
                  <div style={chStyle}>
                    <div style={{ ...avStyle, background: C.bad, color: '#1a0606' }}>!</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5, color: C.bad }}>No leader</div>
                      <div style={{ color: C.mut2, fontSize: 11 }}>handoff drops here</div>
                    </div>
                    <span style={{ ...cntStyle, borderColor: '#5a2226' }}>{unassigned.length}</span>
                  </div>

                  <div style={bodyStyle}>
                    {unassigned.map((item) => (
                      <button
                        key={item.node.id}
                        type="button"
                        onClick={() => {
                          setSelectedId(item.node.id)
                          handleCardClick(item.node)
                        }}
                        style={{
                          ...cardStyle,
                          borderColor: '#5a2226',
                          ...(item.node.id === selectedId ? { ...cardSelectedStyle, borderColor: C.bad } : {}),
                        }}
                      >
                        <span style={{ ...dotStyle, background: C.bad }} />
                        <span style={{ fontSize: 12.5 }}>{item.node.name}</span>
                      </button>
                    ))}
                  </div>

                  <div style={assignStyle}>＋ Assign these to a leader</div>
                </div>
              ) : null}
            </div>

            <p style={{ marginTop: 14, color: C.mut2, fontSize: 11.5 }}>
              Design B &mdash; reframed by <strong>where leads actually go</strong>, not nominal hierarchy.
              Drag a card to another column = change that person&rsquo;s leader.
              The red column makes broken handoffs impossible to miss.
            </p>
          </>
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
          <div style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 85,
            maxWidth: '22rem', borderRadius: 6,
            border: '1px solid rgba(63,185,80,0.35)', background: 'rgba(63,185,80,0.15)',
            padding: '8px 14px', fontSize: 12.5, fontWeight: 600, color: '#3fb950',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          }}>
            {toastMsg}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/* ── shared style objects ── */

const btnStyle: React.CSSProperties = {
  background: 'transparent', border: '1px solid #1f2a36', color: '#8b9aab',
  borderRadius: 6, padding: '6px 14px', fontSize: 12.5, cursor: 'pointer',
  marginTop: 8,
}

const colStyle: React.CSSProperties = {
  flex: '0 0 250px', background: '#121922', border: '1px solid #1f2a36',
  borderRadius: 12, display: 'flex', flexDirection: 'column', maxHeight: 560,
}

const chStyle: React.CSSProperties = {
  padding: '12px 13px', borderBottom: '1px solid #1f2a36',
  display: 'flex', alignItems: 'center', gap: 9, position: 'sticky', top: 0,
}

const avStyle: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 8, display: 'flex',
  alignItems: 'center', justifyContent: 'center', fontWeight: 700,
  fontSize: 12, flex: '0 0 auto',
}

const cntStyle: React.CSSProperties = {
  marginLeft: 'auto', fontSize: 11, color: '#8b9aab',
  border: '1px solid #1f2a36', borderRadius: 999, padding: '2px 8px',
}

const bodyStyle: React.CSSProperties = {
  padding: 9, overflowY: 'auto', display: 'flex',
  flexDirection: 'column', gap: 7, flex: 1,
}

const cardStyle: React.CSSProperties = {
  background: '#0f151d', border: '1px solid #1a2530', borderRadius: 9,
  padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8,
  cursor: 'pointer', color: '#e6edf3', textAlign: 'left', width: '100%',
}

const cardSelectedStyle: React.CSSProperties = {
  outline: '2px solid #6e8bff', outlineOffset: 1,
}

const dotStyle: React.CSSProperties = {
  width: 7, height: 7, borderRadius: '50%', flex: '0 0 auto',
}

const noteStyle: React.CSSProperties = {
  margin: '9px 13px 12px', fontSize: 11, color: '#5e6e7e',
}

const assignStyle: React.CSSProperties = {
  margin: '8px 9px 11px', textAlign: 'center', fontSize: 11.5,
  color: '#ffb4ae', border: '1px dashed #5a2226', borderRadius: 8,
  padding: 8, cursor: 'pointer', marginTop: 'auto',
}
