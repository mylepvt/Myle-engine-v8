import Fastify from "fastify";
import cors from "@fastify/cors";
import { Server } from "socket.io";
import { ZodError } from "zod";
import { prisma } from "./db.js";
import { registerRoutes } from "./routes/index.js";
import { attachSocketAuth } from "./realtime/socket.js";

const PORT = Number(process.env.CRM_API_PORT ?? 4000);

export async function buildApp() {
  const fastify = Fastify({ logger: true });
  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

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

  await registerRoutes(fastify);

  const io = new Server(fastify.server, {
    cors: { origin: true, credentials: true },
  });
  attachSocketAuth(io);

  fastify.decorate("io", io);

  return { fastify, io };
}

async function main() {
  const { fastify } = await buildApp();
  await fastify.listen({ port: PORT, host: "0.0.0.0" });
  fastify.log.info(`crm-api listening on ${PORT}`);

  const shutdown = async () => {
    await fastify.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
