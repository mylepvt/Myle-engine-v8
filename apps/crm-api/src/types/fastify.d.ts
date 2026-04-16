import type { Server } from "socket.io";
import type { PrismaClient } from "@prisma/client";

declare module "fastify" {
  interface FastifyInstance {
    io: Server;
    prisma: PrismaClient;
  }
}
