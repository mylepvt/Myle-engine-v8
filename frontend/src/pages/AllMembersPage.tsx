import { TeamMembersPage } from '@/pages/TeamMembersPage'

type Props = { title: string }

/** Settings → All members — same directory + create user as Team → Members (legacy `/admin/members`). */
export function AllMembersPage(props: Props) {
  return <TeamMembersPage {...props} />
}
