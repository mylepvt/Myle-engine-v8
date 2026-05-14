import Fastify from "fastify";
import cors from "@fastify/cors";
import { Server } from "socket.io";
import { ZodError } from "zod";
import { prisma } from "./db.js";
import { registerRoutes } from "./routes/index.js";
import { attachSocketAuth, shutdownSocket } from "./realtime/socket.js";
import { attachRedisAdapter, detachRedisAdapter } from "./realtime/adapter.js";
import { EventGateway } from "./realtime/gateway.js";
import { closeRedis } from "./realtime/redis-client.js";

const PORT = Number(process.env.CRM_API_PORT ?? 4000);

export async function buildApp() {
  const fastify = Fastify({ logger: true });
  await fastify.register(cors, { origin: true, credentials: true });

  fastify.decorate("prisma", prisma);
  fastify.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  fastify.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: "Validation failed", issues: err.flatten() });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    const code = (err as { code?: string }).code;
    if (status >= 500) fastify.log.error(err);
    const message = err instanceof Error ? err.message : String(err);
    return reply.status(status).send({
      error: message,
      ...(code ? { code } : {}),
    });
  });

  fastify.get("/health", async () => ({
    ok: true,
    service: "crm-api",
    ts: new Date().toISOString(),
  }));

  const io = new Server(fastify.server, {
    cors: { origin: true, credentials: true },
  });
  attachSocketAuth(io);

  if (process.env.CRM_REDIS_ADAPTER !== "false") {
    attachRedisAdapter(io);
  }

  const gateway = new EventGateway(io);
  fastify.decorate("io", io);
  fastify.decorate("gateway", gateway);

  await registerRoutes(fastify);

  return { fastify, io, gateway };
}

async function main() {
  const { fastify } = await buildApp();
  await fastify.listen({ port: PORT, host: "0.0.0.0" });
  fastify.log.info(`crm-api listening on ${PORT}`);

  const shutdown = async () => {
    fastify.log.info("shutting down...");
    shutdownSocket();
    await fastify.close();
    await closeRedis();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
