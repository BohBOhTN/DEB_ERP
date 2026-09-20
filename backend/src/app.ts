import cors from "cors";
import express from "express";
import helmet from "helmet";
import { errorHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import type { AuthService } from "./modules/auth/auth.service.js";
import type { SessionCookieConfig } from "./modules/auth/cookies.js";
import { healthRouter } from "./modules/health/health.routes.js";
import type { HealthCheck } from "./modules/health/health.service.js";
import { AppError } from "./shared/appError.js";
import { correlationId } from "./shared/correlation.js";

export function createApp(params: {
  allowedOrigins: string[];
  healthCheck: HealthCheck;
  auth?: {
    authService: AuthService;
    cookie: SessionCookieConfig;
    rateLimit: {
      maxAttempts: number;
      windowMs: number;
    };
  };
}): express.Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: params.allowedOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(correlationId);

  app.use("/api/health", healthRouter(params.healthCheck));

  if (params.auth) {
    app.use("/api/auth", authRouter(params.auth));
  }

  app.use((_request, _response, next) => {
    next(
      new AppError({
        statusCode: 404,
        code: "NOT_FOUND",
        message: "Ressource introuvable.",
      }),
    );
  });

  app.use(errorHandler);

  return app;
}
