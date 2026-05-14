import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../lib/auth-context.js";
import { getPresenceManager } from "../realtime/socket.js";

const ADMIN_ACTIVITY_LIMIT = 100;
const ACTIONS_FILTER = [
  "claim", "claim.batch", "claim.duplicate",
  "reassign", "escalation.reassign",
  "close",
  "fsm.transition",
  "wallet.credit",
];

export async function adminRoutes(fastify: FastifyInstance) {
  fastify.get("/admin/activity", async (req) => {
    const user = requireAuth(req);
    if (user.role !== "admin") {
      return { error: "Forbidden" };
    }
    const q = z.object({
      limit: z.coerce.number().int().min(1).max(500).default(50),
      cursor: z.string().optional(),
      action: z.string().optional(),
    }).parse(req.query);

    const where: Record<string, unknown> = {};
    if (q.action) {
      where.action = q.action;
    } else {
      where.action = { in: ACTIONS_FILTER };
    }
    if (q.cursor) {
      where.createdAt = { lt: new Date(q.cursor) };
    }

    const rows = await prisma.auditLog.findMany({
      where: where as any,
      orderBy: { createdAt: "desc" },
      take: Math.min(q.limit, ADMIN_ACTIVITY_LIMIT),
      select: {
        id: true,
        action: true,
        actorId: true,
        leadId: true,
        targetUserId: true,
        amountCents: true,
        meta: true,
        createdAt: true,
      },
    });

    return {
      entries: rows.map((r: { id: string; action: string; actorId: string | null; leadId: string | null; targetUserId: string | null; amountCents: number | null; meta: unknown; createdAt: Date }) => ({
        id: r.id,
        action: r.action,
        actorId: r.actorId,
        targetId: r.leadId ?? r.targetUserId,
        targetType: r.leadId ? "lead" : "user",
        description: describeAction(r.action, r),
        severity: r.action.startsWith("escalation") ? "warning" : "info",
        timestamp: r.createdAt.getTime(),
        metadata: r.meta as Record<string, unknown> | undefined,
      })),
      nextCursor: rows.length === Math.min(q.limit, ADMIN_ACTIVITY_LIMIT)
        ? rows[rows.length - 1]?.createdAt.toISOString()
        : undefined,
    };
  });

  fastify.get("/admin/presence", async (req) => {
    const user = requireAuth(req);
    if (user.role !== "admin") {
      return { error: "Forbidden" };
    }
    const presence = getPresenceManager();
    const all = await presence.getAll();

    const entries = await Promise.all(
      Object.entries(all).map(async ([userId, data]) => {
        let name: string | null = null;
        try {
          const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
          name = u?.name ?? null;
        } catch { }
        return {
          userId,
          name,
          status: data.status,
          lastSeen: data.lastSeen,
          role: data.role,
          teamId: data.teamId,
        };
      }),
    );

    return {
      online: entries.filter((e) => e.status === "online").length,
      idle: entries.filter((e) => e.status === "idle").length,
      total: entries.length,
      users: entries.sort((a, b) => b.lastSeen - a.lastSeen),
    };
  });
}

function describeAction(action: string, row: { actorId?: string | null; leadId?: string | null; targetUserId?: string | null; amountCents?: number | null }) {
  const actor = row.actorId ? row.actorId.slice(0, 8) : "system";
  switch (action) {
    case "claim": return `Claimed lead ${row.leadId?.slice(0, 8)} (₹${((row.amountCents ?? 0) / 100).toFixed(2)})`;
    case "claim.batch": return `Batch claim (see details)`;
    case "claim.duplicate": return `Duplicate claim attempt on ${row.leadId?.slice(0, 8)}`;
    case "reassign": return `Reassigned ${row.leadId?.slice(0, 8)} to ${row.targetUserId?.slice(0, 8)}`;
    case "escalation.reassign": return `Auto-reassigned ${row.leadId?.slice(0, 8)} (idle escalation)`;
    case "close": return `Closed lead ${row.leadId?.slice(0, 8)}`;
    case "wallet.credit": return `${actor} credited ₹${((row.amountCents ?? 0) / 100).toFixed(2)} to ${row.targetUserId?.slice(0, 8)}`;
    default: return `${action} on ${row.leadId?.slice(0, 8) ?? row.targetUserId?.slice(0, 8) ?? "unknown"}`;
  }
}
