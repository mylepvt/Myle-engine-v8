import type { Server } from "socket.io";
import type { PrismaClient } from "@prisma/client";
import type { EventGateway } from "../realtime/gateway.js";

declare module "fastify" {
  interface FastifyInstance {
    io: Server;
    prisma: PrismaClient;
    gateway: EventGateway;
  }
}
