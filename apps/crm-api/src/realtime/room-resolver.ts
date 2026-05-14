import type { EventContract } from "./types.js";
import { SOCKET_ROOMS, leadRoom, pipelineRoom, teamRoom, userRoom } from "./rooms.js";

export type RoomResolver = (event: EventContract) => string[];

export const roomResolvers: Record<string, RoomResolver> = {
  "lead:created": (e) => resolveLeadRooms(e),
  "lead:transitioned": (e) => resolveLeadRooms(e),
  "lead:assigned": (e) => resolveLeadRooms(e, true),
  "lead:closed": (e) => resolveLeadRooms(e, true),
  "lead:escalated": (e) => [...resolveLeadRooms(e, true), SOCKET_ROOMS.adminRoom],
  "lead:claimed": (e) => resolveLeadRooms(e),
  "lead:batch_claimed": (e) => resolveLeadRooms(e),
  "wallet:debited": (e) => userRoomsFromPayload(e),
  "wallet:credited": (e) => userRoomsFromPayload(e),
  "performance:score_updated": (e) => userRoomsFromPayload(e),
  "admin:activity": () => [SOCKET_ROOMS.adminRoom],
  "admin:system_alert": () => [SOCKET_ROOMS.adminRoom],
  "presence:online": () => [SOCKET_ROOMS.adminRoom],
  "presence:offline": () => [SOCKET_ROOMS.adminRoom],
  "presence:idle": () => [SOCKET_ROOMS.adminRoom],
  "system:scheduler_tick": () => [SOCKET_ROOMS.adminRoom],
};

function resolveLeadRooms(event: EventContract, includeAdmin = false): string[] {
  const p = event.payload as Record<string, unknown>;
  const rooms: string[] = [];

  const leadId = p.leadId as string | undefined;
  const handlerId = p.handlerId as string | undefined;
  const ownerId = p.ownerId as string | undefined;
  const teamId = p.teamId as string | undefined;
  const pipelineKind = (p.pipelineKind as string)?.toUpperCase() === "PERSONAL" ? "PERSONAL" : "TEAM";

  rooms.push(pipelineRoom(pipelineKind));
  if (leadId) rooms.push(leadRoom(leadId));
  if (handlerId) rooms.push(userRoom(handlerId));
  if (ownerId && ownerId !== handlerId) rooms.push(userRoom(ownerId));
  if (teamId) rooms.push(teamRoom(teamId));
  if (includeAdmin) rooms.push(SOCKET_ROOMS.adminRoom);

  return rooms;
}

function userRoomsFromPayload(event: EventContract): string[] {
  const p = event.payload as Record<string, unknown>;
  const userId = (p.userId ?? p.targetUserId ?? p.actorId) as string | undefined;
  if (userId) return [userRoom(userId)];
  return [];
}
