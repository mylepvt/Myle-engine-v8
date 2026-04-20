import type { FastifyInstance } from "fastify";
import { requireAuth } from "../lib/auth-context.js";

export async function escalationRoutes(fastify: FastifyInstance) {
  fastify.get("/escalations", async (req, reply) => {
    requireAuth(req);
    return reply.code(410).send({ error: "Escalations moved to FastAPI" });
  });

  fastify.post("/escalations", async (req, reply) => {
    requireAuth(req);
    return reply.code(410).send({ error: "Escalations moved to FastAPI" });
  });

  fastify.post("/escalations/:id/ack", async (req, reply) => {
    requireAuth(req);
    return reply.code(410).send({ error: "Escalations moved to FastAPI" });
  });
}
