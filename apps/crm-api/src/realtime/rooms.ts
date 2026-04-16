/** Room naming — keep in sync with apps/crm-api/docs/SOCKET_ROOMS.md */
export const SOCKET_ROOMS = {
  userPrefix: "user:",
  leadPrefix: "lead:",
  pipelinePrefix: "pipeline:",
  rolePrefix: "role:",
  teamPrefix: "team:",
  orgPrefix: "org:",
  /** Global admin channel for system / alive / escalation alerts */
  adminRoom: "admin",
} as const;

export function userRoom(userId: string) {
  return `${SOCKET_ROOMS.userPrefix}${userId}`;
}

export function leadRoom(leadId: string) {
  return `${SOCKET_ROOMS.leadPrefix}${leadId}`;
}

export function pipelineRoom(kind: "PERSONAL" | "TEAM") {
  return `${SOCKET_ROOMS.pipelinePrefix}${kind.toLowerCase()}`;
}

export function teamRoom(teamId: string) {
  return `${SOCKET_ROOMS.teamPrefix}${teamId}`;
}
