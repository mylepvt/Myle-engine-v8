import { createAdapter } from "@socket.io/redis-adapter";
import type { Server } from "socket.io";
import { getIoredis } from "./redis-client.js";

let subClient: ReturnType<typeof getIoredis> | null = null;

export function attachRedisAdapter(io: Server) {
  const pubClient = getIoredis();
  subClient = pubClient.duplicate();

  subClient.on("error", (e) => console.error("[redis-adapter-sub]", e));
  subClient.on("end", () => console.warn("[redis-adapter-sub] connection ended"));

  io.adapter(createAdapter(pubClient, subClient));
  console.log("[socket.io] Redis adapter attached — multi-instance ready");
}

export async function detachRedisAdapter(io: Server) {
  if (subClient) {
    try { await subClient.quit(); } catch { }
    subClient = null;
  }
}
