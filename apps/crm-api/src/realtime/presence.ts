import type { Server } from "socket.io";
import type { EventGateway } from "./types.js";
import { getRedisV4 } from "./redis-client.js";
import { SOCKET_ROOMS } from "./rooms.js";

const PRESENCE_KEY = "crm:presence:users";
const STALE_MS = 120_000;
const OFFLINE_MS = 300_000;

export type PresenceStatus = "online" | "idle" | "offline";

export type PresenceData = {
  connectionCount: number;
  lastSeen: number;
  status: PresenceStatus;
  role?: string;
  teamId?: string;
};

export class PresenceManager {
  private io?: Server;
  private gateway?: EventGateway;
  private interval?: ReturnType<typeof setInterval>;
  private started = false;

  constructor(io?: Server, gateway?: EventGateway) {
    this.io = io;
    this.gateway = gateway;
  }

  setIo(io: Server): void { this.io = io; }
  setGateway(gateway: EventGateway): void { this.gateway = gateway; }

  async onConnect(userId: string, data: { role?: string; teamId?: string }): Promise<void> {
    const now = Date.now();
    try {
      const r = await getRedisV4();
      const raw = await r.hGet(PRESENCE_KEY, userId);
      const prev: PresenceData | null = raw ? JSON.parse(raw) : null;

      const updated: PresenceData = {
        connectionCount: (prev?.connectionCount ?? 0) + 1,
        lastSeen: now,
        status: "online",
        role: data.role ?? prev?.role,
        teamId: data.teamId ?? prev?.teamId,
      };
      await r.hSet(PRESENCE_KEY, userId, JSON.stringify(updated));

      if (!prev || prev.status === "offline") {
        this.emitPresence("presence:online", { userId, role: updated.role, teamId: updated.teamId, timestamp: now });
      } else if (prev.status === "idle") {
        this.emitPresence("presence:update", { userId, status: "online", timestamp: now });
      }
    } catch (e) {
      console.error("[presence] onConnect error", e);
    }
  }

  async onDisconnect(userId: string): Promise<void> {
    const now = Date.now();
    try {
      const r = await getRedisV4();
      const raw = await r.hGet(PRESENCE_KEY, userId);
      if (!raw) return;
      const data: PresenceData = JSON.parse(raw);
      const newCount = data.connectionCount - 1;

      if (newCount <= 0) {
        await r.hDel(PRESENCE_KEY, userId);
        this.emitPresence("presence:offline", { userId, lastSeen: now, timestamp: now });
      } else {
        data.connectionCount = newCount;
        data.lastSeen = now;
        data.status = "online";
        await r.hSet(PRESENCE_KEY, userId, JSON.stringify(data));
        this.emitPresence("presence:update", { userId, status: "online", connectionCount: newCount, timestamp: now });
      }
    } catch (e) {
      console.error("[presence] onDisconnect error", e);
    }
  }

  async heartbeat(userId: string): Promise<void> {
    try {
      const r = await getRedisV4();
      const raw = await r.hGet(PRESENCE_KEY, userId);
      if (!raw) return;
      const data: PresenceData = JSON.parse(raw);
      data.lastSeen = Date.now();
      data.status = "online";
      await r.hSet(PRESENCE_KEY, userId, JSON.stringify(data));
    } catch (e) {
      console.error("[presence] heartbeat error", e);
    }
  }

  async getAll(): Promise<Record<string, PresenceData>> {
    try {
      const r = await getRedisV4();
      const raw = await r.hGetAll(PRESENCE_KEY);
      const result: Record<string, PresenceData> = {};
      for (const [userId, json] of Object.entries(raw)) {
        try { result[userId] = JSON.parse(json); } catch { }
      }
      return result;
    } catch {
      return {};
    }
  }

  startStaleScanner(): void {
    if (this.started) return;
    this.started = true;
    const intervalMs = Number(process.env.CRM_PRESENCE_SCAN_INTERVAL_MS ?? 30_000);
    this.interval = setInterval(() => this.scanStale(), intervalMs);
    if (this.interval.unref) this.interval.unref();
  }

  stop(): void {
    this.started = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  private async scanStale(): Promise<void> {
    try {
      const r = await getRedisV4();
      const raw = await r.hGetAll(PRESENCE_KEY);
      const now = Date.now();
      for (const [userId, json] of Object.entries(raw)) {
        let data: PresenceData;
        try { data = JSON.parse(json); } catch { continue; }

        const idle = now - data.lastSeen;
        if (idle > OFFLINE_MS && data.status !== "offline") {
          data.status = "offline";
          await r.hSet(PRESENCE_KEY, userId, JSON.stringify(data));
          this.emitPresence("presence:offline", { userId, lastSeen: data.lastSeen, timestamp: now });
        } else if (idle > STALE_MS && data.status === "online") {
          data.status = "idle";
          await r.hSet(PRESENCE_KEY, userId, JSON.stringify(data));
          this.emitPresence("presence:idle", { userId, idleSince: data.lastSeen, timestamp: now });
        }
      }
    } catch (e) {
      console.error("[presence] scanStale error", e);
    }
  }

  private emitPresence(event: string, payload: Record<string, unknown>): void {
    const rooms = [SOCKET_ROOMS.adminRoom];
    this.io?.to(rooms).emit(event, payload);
    this.gateway?.publish({ type: event, payload, rooms, priority: "low", source: "api" }).catch(() => {});
  }
}
