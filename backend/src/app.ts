import cors from "cors";
import express from "express";
import helmet from "helmet";
import { errorHandler } from "./middleware/errorHandler.js";
import { accessRouter } from "./modules/access/access.routes.js";
import type { AccessService } from "./modules/access/access.service.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import type { AuthService } from "./modules/auth/auth.service.js";
import type { SessionCookieConfig } from "./modules/auth/cookies.js";
import { catalogRouter } from "./modules/catalog/catalog.routes.js";
import type { CatalogService } from "./modules/catalog/catalog.service.js";
import { healthRouter } from "./modules/health/health.routes.js";
import type { HealthCheck } from "./modules/health/health.service.js";
import { inventoryRouter } from "./modules/inventory/inventory.routes.js";
import type { InventoryService } from "./modules/inventory/inventory.service.js";
import { procurementRouter } from "./modules/procurement/procurement.routes.js";
import type { ProcurementService } from "./modules/procurement/procurement.service.js";
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
  access?: {
    accessService: AccessService;
  };
  catalog?: {
    catalogService: CatalogService;
  };
  inventory?: {
    inventoryService: InventoryService;
  };
  procurement?: {
    procurementService: ProcurementService;
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

  if (params.auth && params.access) {
    app.use(
      "/api/access",
      accessRouter({
        authService: params.auth.authService,
        cookie: params.auth.cookie,
        accessService: params.access.accessService,
      }),
    );
  }

  if (params.auth && params.catalog) {
    app.use(
      "/api/catalog",
      catalogRouter({
        authService: params.auth.authService,
        cookie: params.auth.cookie,
        catalogService: params.catalog.catalogService,
      }),
    );
  }

  if (params.auth && params.inventory) {
    app.use(
      "/api/inventory",
      inventoryRouter({
        authService: params.auth.authService,
        cookie: params.auth.cookie,
        inventoryService: params.inventory.inventoryService,
      }),
    );
  }

  if (params.auth && params.procurement) {
    app.use(
      "/api/procurement",
      procurementRouter({
        authService: params.auth.authService,
        cookie: params.auth.cookie,
        procurementService: params.procurement.procurementService,
      }),
    );
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
