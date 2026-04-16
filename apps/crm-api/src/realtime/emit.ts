import type { PipelineKind } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import { SOCKET_ROOMS, leadRoom, pipelineRoom, teamRoom, userRoom } from "./rooms.js";

export type LeadEmitPayload = Record<string, unknown> & { leadId: string };

/**
 * Emit lead-related updates to handler, owner (if different), pipeline, lead room, and team scope.
 * System-level alerts also fan out to `admin` room.
 */
export function emitLeadDomainEvent(
  io: Server | undefined,
  params: {
    pipelineKind: PipelineKind;
    leadId: string;
    handlerId: string | null;
    ownerId: string;
    teamId?: string | null;
    payload: LeadEmitPayload;
    systemAlert?: boolean;
  },
) {
  if (!io) return;
  const { pipelineKind, leadId, handlerId, ownerId, teamId, payload, systemAlert } = params;

  const p = pipelineKind === "PERSONAL" || pipelineKind === "TEAM" ? pipelineKind : "TEAM";
  io.to(pipelineRoom(p)).emit("lead.updated", payload);
  io.to(leadRoom(leadId)).emit("lead.updated", payload);
  if (handlerId) io.to(userRoom(handlerId)).emit("lead.updated", payload);
  if (ownerId && ownerId !== handlerId) io.to(userRoom(ownerId)).emit("lead.updated", payload);
  const tid = teamId ?? "default";
  io.to(teamRoom(tid)).emit("lead.updated", payload);
  if (systemAlert) {
    io.to(SOCKET_ROOMS.adminRoom).emit("lead.updated", payload);
  }
}

export function emitToAdmin(io: Server | undefined, event: string, payload: object) {
  io?.to(SOCKET_ROOMS.adminRoom).emit(event, payload);
}

export function emitToTeam(io: Server | undefined, teamId: string, event: string, payload: object) {
  io?.to(teamRoom(teamId)).emit(event, payload);
}

async function teamScopeForUserId(prisma: PrismaClient, userId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { teamId: true } });
  return u?.teamId ?? "default";
}

/** Load lead row and fan-out (avoids circular imports from pool-claim → lead-execution). */
export async function emitLeadById(
  prisma: PrismaClient,
  io: Server | undefined,
  leadId: string,
  payload: Record<string, unknown>,
  systemAlert?: boolean,
) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return;
  const teamId = await teamScopeForUserId(prisma, lead.handlerId ?? lead.ownerId);
  const merged: LeadEmitPayload = { ...payload, leadId: lead.id };
  emitLeadDomainEvent(io, {
    pipelineKind: lead.pipelineKind,
    leadId: lead.id,
    handlerId: lead.handlerId,
    ownerId: lead.ownerId,
    teamId,
    payload: merged,
    systemAlert,
  });
}
