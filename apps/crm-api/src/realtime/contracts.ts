import { z } from "zod";

export const EventContractSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1).max(64),
  version: z.literal(1),
  priority: z.enum(["high", "medium", "low"]),
  timestamp: z.number(),
  source: z.enum(["api", "worker", "fastapi"]),
  rooms: z.array(z.string()).default([]),
  payload: z.record(z.unknown()),
  idempotencyKey: z.string().min(1).max(128),
  correlationId: z.string().optional(),
  causationId: z.string().optional(),
});

export type EventContract = z.infer<typeof EventContractSchema>;

export const AdminActivitySchema = z.object({
  action: z.string(),
  actorId: z.string().optional(),
  actorName: z.string().optional(),
  targetId: z.string().optional(),
  targetType: z.enum(["lead", "user", "wallet", "system"]).optional(),
  description: z.string(),
  metadata: z.record(z.unknown()).default({}),
  severity: z.enum(["info", "warning", "error"]).default("info"),
});

export type AdminActivityPayload = z.infer<typeof AdminActivitySchema>;

export const AdminActivityEventSchema = EventContractSchema.extend({
  type: z.literal("admin:activity"),
  payload: AdminActivitySchema,
});

export const PresenceOnlineSchema = z.object({
  userId: z.string(),
  role: z.string().optional(),
  teamId: z.string().optional(),
  timestamp: z.number(),
});

export const PresenceOfflineSchema = z.object({
  userId: z.string(),
  lastSeen: z.number(),
  timestamp: z.number(),
});

export const LeadEventSchema = z.object({
  leadId: z.string(),
  stage: z.string().optional(),
  claimed: z.boolean().optional(),
  reassign: z.boolean().optional(),
  closed: z.boolean().optional(),
});

export const WalletEventSchema = z.object({
  leadId: z.string(),
  duplicate: z.boolean().optional(),
  balanceCents: z.number().optional(),
});

export const PerformanceEventSchema = z.object({
  userId: z.string(),
  pipelineKind: z.string(),
  compositeScore: z.number(),
});
