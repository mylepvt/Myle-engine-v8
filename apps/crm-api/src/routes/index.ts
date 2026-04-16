import type { FastifyInstance } from "fastify";
import { leadRoutes } from "./leads.js";
import { poolRoutes } from "./pool.js";
import { walletRoutes } from "./wallet.js";
import { escalationRoutes } from "./escalation.js";
import { performanceRoutes } from "./performance.js";
import { qaRoutes } from "./qa.js";

export async function registerRoutes(fastify: FastifyInstance) {
  await fastify.register(leadRoutes, { prefix: "/api/v1" });
  await fastify.register(poolRoutes, { prefix: "/api/v1" });
  await fastify.register(walletRoutes, { prefix: "/api/v1" });
  await fastify.register(escalationRoutes, { prefix: "/api/v1" });
  await fastify.register(performanceRoutes, { prefix: "/api/v1" });
  await fastify.register(qaRoutes, { prefix: "/api/v1" });
}
