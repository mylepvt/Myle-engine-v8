import type { PipelineKind } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { Server } from "socket.io";
import type { EventGateway } from "./types.js";
import { SOCKET_ROOMS, leadRoom, pipelineRoom, teamRoom, userRoom } from "./rooms.js";
import { getRedisEmitter } from "./emitter.js";

export type LeadEmitPayload = Record<string, unknown> & { leadId: string };

function publishViaGateway(
  gateway: EventGateway | undefined,
  type: string,
  payload: Record<string, unknown>,
  rooms: string[],
  priority: "high" | "medium" | "low" = "medium",
  source: "api" | "worker" | "fastapi" = "api",
) {
  if (!gateway) return;
  gateway.publish({ type, payload, rooms, priority, source }).catch((e) =>
    console.warn(`[emit] gateway publish failed: ${type}`, e),
  );
}

function publishViaIo(io: Server | undefined, event: string, payload: object, rooms: string[]) {
  if (!io) return;
  io.to(rooms).emit(event, payload);
}

export function emitLeadDomainEvent(
  io: Server | undefined,
  gateway: EventGateway | undefined,
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
  const { pipelineKind, leadId, handlerId, ownerId, teamId, payload, systemAlert } = params;

  const p = pipelineKind === "PERSONAL" || pipelineKind === "TEAM" ? pipelineKind : "TEAM";
  const rooms: string[] = [pipelineRoom(p), leadRoom(leadId)];
  if (handlerId) rooms.push(userRoom(handlerId));
  if (ownerId && ownerId !== handlerId) rooms.push(userRoom(ownerId));
  rooms.push(teamRoom(teamId ?? "default"));
  if (systemAlert) rooms.push(SOCKET_ROOMS.adminRoom);

  publishViaGateway(gateway, "lead:updated", payload, rooms, systemAlert ? "high" : "medium");
  publishViaIo(io, "lead.updated", payload, rooms);
}

export type AdminActivityInput = {
  action: string;
  actorId?: string;
  actorName?: string;
  targetId?: string;
  targetType?: "lead" | "user" | "wallet" | "system";
  description: string;
  metadata?: Record<string, unknown>;
  severity?: "info" | "warning" | "error";
};

function buildAdminPayload(input: AdminActivityInput) {
  return {
    action: input.action,
    actorId: input.actorId,
    actorName: input.actorName,
    targetId: input.targetId,
    targetType: input.targetType ?? "system",
    description: input.description,
    metadata: input.metadata ?? {},
    severity: input.severity ?? "info",
    timestamp: Date.now(),
  };
}

export function emitAdminActivity(
  io: Server | undefined,
  gateway: EventGateway | undefined,
  input: AdminActivityInput,
) {
  const payload = buildAdminPayload(input);
  const rooms = [SOCKET_ROOMS.adminRoom];
  publishViaGateway(gateway, "admin:activity", payload, rooms, "high");
  publishViaIo(io, "admin:activity", payload, rooms);
}

export function emitAdminActivityWorker(input: AdminActivityInput) {
  if (process.env.CRM_EVENT_GATEWAY_ENABLED === "false") return;
  try {
    const emitter = getRedisEmitter();
    emitter.to(SOCKET_ROOMS.adminRoom).emit("admin:activity", buildAdminPayload(input));
  } catch (e) {
    console.warn("[emit] worker admin activity failed", e);
  }
}

export function emitToAdmin(
  io: Server | undefined,
  gateway: EventGateway | undefined,
  event: string,
  payload: object,
) {
  const rooms = [SOCKET_ROOMS.adminRoom];
  publishViaGateway(gateway, event, payload as Record<string, unknown>, rooms, "high");
  publishViaIo(io, event, payload, rooms);
}

export function emitToTeam(
  io: Server | undefined,
  gateway: EventGateway | undefined,
  teamId: string,
  event: string,
  payload: object,
) {
  const rooms = [teamRoom(teamId)];
  publishViaGateway(gateway, event, payload as Record<string, unknown>, rooms);
  publishViaIo(io, event, payload, rooms);
}

async function teamScopeForUserId(prisma: PrismaClient, userId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { teamId: true } });
  return u?.teamId ?? "default";
}

export async function emitLeadById(
  prisma: PrismaClient,
  io: Server | undefined,
  gateway: EventGateway | undefined,
  leadId: string,
  payload: Record<string, unknown>,
  systemAlert?: boolean,
) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return;
  const teamId = await teamScopeForUserId(prisma, lead.handlerId ?? lead.ownerId);
  const merged: LeadEmitPayload = { ...payload, leadId: lead.id };
  emitLeadDomainEvent(io, gateway, {
    pipelineKind: lead.pipelineKind,
    leadId: lead.id,
    handlerId: lead.handlerId,
    ownerId: lead.ownerId,
    teamId,
    payload: merged,
    systemAlert,
  });
}
