import { randomUUID } from "node:crypto";
import type { Server } from "socket.io";
import { EventContractSchema } from "./contracts.js";
import type { EventContract, EventReceipt } from "./types.js";
import { EventDedup } from "./dedup.js";
import { RateLimiter } from "./rate-limiter.js";
import { EventBatcher } from "./batcher.js";
import { roomResolvers } from "./room-resolver.js";
import { recordAudit } from "../services/audit.service.js";

export type PublishInput = {
  type: string;
  payload: Record<string, unknown>;
  rooms?: string[];
  priority?: "high" | "medium" | "low";
  source?: "api" | "worker" | "fastapi";
  id?: string;
  idempotencyKey?: string;
  correlationId?: string;
  causationId?: string;
};

export class EventGateway {
  private dedup = new EventDedup();
  private rateLimiter = new RateLimiter();
  private batcher = new EventBatcher();
  private io?: Server;

  constructor(io?: Server) {
    this.io = io;
    this.batcher.onFlush = (key, events) => {
      for (const event of events) {
        this.dispatch(event).catch((e) =>
          console.error("[gateway] batch dispatch failed", event.type, e),
        );
      }
    };
  }

  setIo(io: Server) {
    this.io = io;
  }

  async publish(raw: PublishInput): Promise<EventReceipt> {
    const event = this.buildEvent(raw);
    const receipt: EventReceipt = { id: event.id, published: false, deduplicated: false, timestamp: event.timestamp };

    const parsed = EventContractSchema.safeParse(event);
    if (!parsed.success) {
      console.warn("[gateway] invalid event", parsed.error.issues);
      return receipt;
    }

    try {
      const isDup = await this.dedup.isDuplicate(event.id);
      if (isDup) {
        receipt.deduplicated = true;
        return receipt;
      }

      const { allowed, reason } = this.rateLimiter.allow(event.type);
      if (!allowed) {
        console.warn(`[gateway] rate limited: ${event.type} — ${reason}`);
        return receipt;
      }

      event.rooms = this.resolveRooms(event);

      if (event.priority === "low") {
        await this.batcher.add(event);
        receipt.published = true;
        return receipt;
      }

      await this.dispatch(event);
      receipt.published = true;

      if (event.type.startsWith("admin:")) {
        this.persistAdminEvent(event).catch((e) => console.warn("[gateway] persist failed", e));
      }
    } catch (e) {
      console.error(`[gateway] publish error for ${event.type}`, e);
    }

    return receipt;
  }

  private buildEvent(raw: PublishInput): EventContract {
    return {
      id: raw.id ?? randomUUID(),
      type: raw.type,
      version: 1,
      priority: raw.priority ?? "medium",
      timestamp: Date.now(),
      source: raw.source ?? "api",
      rooms: raw.rooms ?? [],
      payload: raw.payload,
      idempotencyKey: raw.idempotencyKey ?? `${raw.type}:${Date.now()}:${randomUUID().slice(0, 8)}`,
      correlationId: raw.correlationId,
      causationId: raw.causationId,
    };
  }

  private resolveRooms(event: EventContract): string[] {
    const resolver = roomResolvers[event.type];
    if (resolver) return resolver(event);
    return event.rooms;
  }

  private async dispatch(event: EventContract): Promise<void> {
    if (!this.io) {
      console.warn(`[gateway] no socket.io server — dropping ${event.type}`);
      return;
    }
    const rooms = event.rooms;
    try {
      if (rooms.length === 0) {
        this.io.emit(event.type, event.payload);
      } else {
        this.io.to(rooms).emit(event.type, event.payload);
      }
    } catch (e) {
      console.error(`[gateway] dispatch failed for ${event.type}`, e);
    }
  }

  private async persistAdminEvent(event: EventContract): Promise<void> {
    const p = event.payload as Record<string, unknown>;
    await recordAudit({
      source: event.source,
      action: event.type,
      actorId: (p.actorId as string) ?? undefined,
      leadId: (p.leadId as string) ?? (p.targetId as string) ?? undefined,
      targetUserId: (p.targetUserId as string) ?? undefined,
      idempotencyKey: `audit:gateway:${event.id}`,
      meta: { eventId: event.id, correlationId: event.correlationId, payload: p },
    });
  }

  async drain(): Promise<void> {
    this.batcher.drain();
  }

  destroy(): void {
    this.batcher.destroy();
    this.rateLimiter.destroy();
  }

  health() {
    return { enabled: true, ioConnected: !!this.io };
  }
}
