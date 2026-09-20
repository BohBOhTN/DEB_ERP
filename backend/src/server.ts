import { PrismaClient } from "@prisma/client";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { PrismaAuthRepository } from "./modules/auth/auth.repository.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { createHealthCheck } from "./modules/health/health.service.js";

const prisma = new PrismaClient();
const authService = new AuthService(
  new PrismaAuthRepository(prisma),
  env.SESSION_TTL_MINUTES,
);
const app = createApp({
  allowedOrigins: env.CORS_ALLOWED_ORIGINS.split(",").map((origin) =>
    origin.trim(),
  ),
  healthCheck: createHealthCheck({
    prisma,
    environment: env.NODE_ENV,
  }),
  auth: {
    authService,
    cookie: {
      name: env.SESSION_COOKIE_NAME,
      secure: env.NODE_ENV === "production",
      maxAgeMs: env.SESSION_TTL_MINUTES * 60 * 1000,
    },
    rateLimit: {
      maxAttempts: env.RATE_LIMIT_MAX,
      windowMs: env.RATE_LIMIT_WINDOW_MS,
    },
  },
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
