import { prisma } from "../db.js";

export type AuditSource = "api" | "worker";

export async function recordAudit(input: {
  source: AuditSource;
  action: string;
  leadId?: string | null;
  actorId?: string | null;
  targetUserId?: string | null;
  amountCents?: number | null;
  idempotencyKey?: string | null;
  meta?: Record<string, unknown> | null;
}) {
  try {
    return await prisma.auditLog.create({
      data: {
        source: input.source,
        action: input.action,
        leadId: input.leadId ?? undefined,
        actorId: input.actorId ?? undefined,
        targetUserId: input.targetUserId ?? undefined,
        amountCents: input.amountCents ?? undefined,
        idempotencyKey: input.idempotencyKey ?? undefined,
        meta: input.meta === undefined ? undefined : (input.meta as object),
      },
    });
  } catch (e: unknown) {
    if (typeof e === "object" && e && "code" in e && (e as { code?: string }).code === "P2002") {
      return null;
    }
    throw e;
  }
}
