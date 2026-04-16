import type { FastifyRequest } from "fastify";

export type AuthUser = { id: string; role: string; email: string };

/** Dev auth: `Authorization: Bearer <jwt>` or `x-user-id` + `x-user-role` */
export function getAuthUser(req: FastifyRequest): AuthUser | null {
  const h = req.headers;
  const uid = (h["x-user-id"] as string | undefined)?.trim();
  const role = (h["x-user-role"] as string | undefined)?.trim() ?? "team";
  const auth = h.authorization;
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString()) as {
          sub?: string;
          role?: string;
          email?: string;
        };
        if (payload.sub) {
          return {
            id: payload.sub,
            role: payload.role ?? role,
            email: payload.email ?? "unknown@local",
          };
        }
      }
    } catch {
      /* fall through */
    }
  }
  if (uid) {
    return { id: uid, role, email: `${uid}@dev.local` };
  }
  return null;
}

export function requireAuth(req: FastifyRequest): AuthUser {
  const u = getAuthUser(req);
  if (!u) {
    const err = new Error("Unauthorized");
    (err as { statusCode?: number }).statusCode = 401;
    throw err;
  }
  return u;
}
