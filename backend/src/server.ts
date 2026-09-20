import { PrismaClient } from "@prisma/client";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { createHealthCheck } from "./modules/health/health.service.js";

const prisma = new PrismaClient();
const app = createApp({
  allowedOrigins: env.CORS_ALLOWED_ORIGINS.split(",").map((origin) =>
    origin.trim(),
  ),
  healthCheck: createHealthCheck({
    prisma,
    environment: env.NODE_ENV,
  }),
});

const server = app.listen(env.PORT, () => {
  console.log(`API listening on port ${env.PORT}`);
});

async function shutdown(): Promise<void> {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});
