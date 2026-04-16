import * as jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
import type { Server } from "socket.io";
import { SOCKET_ROOMS, leadRoom, teamRoom, userRoom } from "./rooms.js";

/**
 * Production: CRM_REQUIRE_SOCKET_AUTH !== "false" → JWT mandatory (CRM_JWT_SECRET).
 * Rooms: user:{id}, team:{team_id}, admin, pipeline:*, role:*, lead:* (on join:lead)
 */
export function attachSocketAuth(io: Server) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token ?? socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, "");
    const requireTok = process.env.CRM_REQUIRE_SOCKET_AUTH !== "false";

    if (!requireTok) {
      socket.data.userId = parsePayloadSubUnsafe(token);
      socket.data.role = (socket.handshake.auth?.role as string) ?? "team";
      socket.data.teamId =
        (socket.handshake.auth?.team_id as string) ?? (socket.handshake.auth?.teamId as string) ?? "default";
      return next();
    }

    if (!token) {
      return next(new Error("unauthorized"));
    }
    const secret = process.env.CRM_JWT_SECRET;
    if (!secret) {
      return next(new Error("server_misconfig"));
    }
    try {
      const decoded = jwt.verify(token, secret) as JwtPayload & { team_id?: string };
      if (typeof decoded.sub !== "string" || decoded.sub.length === 0) {
        return next(new Error("unauthorized"));
      }
      socket.data.userId = decoded.sub;
      socket.data.role = (decoded.role as string) ?? "team";
      socket.data.teamId = typeof decoded.team_id === "string" ? decoded.team_id : "default";
    } catch {
      return next(new Error("unauthorized"));
    }
    next();
  });

  io.on("connection", (socket) => {
    const uid = socket.data.userId ?? "anonymous";
    const teamId = socket.data.teamId ?? "default";
    socket.join(userRoom(uid));
    socket.join(teamRoom(teamId));
    if (socket.data.role) socket.join(`${SOCKET_ROOMS.rolePrefix}${socket.data.role}`);
    if (socket.data.role === "admin") {
      socket.join(SOCKET_ROOMS.adminRoom);
    }
    socket.on("join:lead", (leadId: string) => {
      if (typeof leadId === "string" && leadId.length > 0) socket.join(leadRoom(leadId));
    });
    socket.emit("crm:ready", { rooms: Array.from(socket.rooms) });
  });
}

function parsePayloadSubUnsafe(token: string | undefined): string | undefined {
  if (!token) return undefined;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return undefined;
    const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString()) as { sub?: string };
    return payload.sub;
  } catch {
    return undefined;
  }
}
