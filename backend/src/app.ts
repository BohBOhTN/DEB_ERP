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
import { customersRouter } from "./modules/customers/customers.routes.js";
import type { CustomersService } from "./modules/customers/customers.service.js";
import { distributionRouter } from "./modules/distribution/distribution.routes.js";
import type { DistributionService } from "./modules/distribution/distribution.service.js";
import { healthRouter } from "./modules/health/health.routes.js";
import type { HealthCheck } from "./modules/health/health.service.js";
import { inventoryRouter } from "./modules/inventory/inventory.routes.js";
import type { InventoryService } from "./modules/inventory/inventory.service.js";
import { ordersRouter } from "./modules/orders/orders.routes.js";
import type { OrdersService } from "./modules/orders/orders.service.js";
import { posRouter } from "./modules/pos/pos.routes.js";
import type { PosService } from "./modules/pos/pos.service.js";
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
  customers?: {
    customersService: CustomersService;
  };
  distribution?: {
    distributionService: DistributionService;
  };
  inventory?: {
    inventoryService: InventoryService;
  };
  orders?: {
    ordersService: OrdersService;
  };
  procurement?: {
    procurementService: ProcurementService;
  };
  pos?: {
    posService: PosService;
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

  if (params.auth && params.customers) {
    app.use(
      "/api",
      customersRouter({
        authService: params.auth.authService,
        cookie: params.auth.cookie,
        customersService: params.customers.customersService,
      }),
    );
  }

  if (params.auth && params.distribution) {
    app.use(
      "/api",
      distributionRouter({
        authService: params.auth.authService,
        cookie: params.auth.cookie,
        distributionService: params.distribution.distributionService,
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

  if (params.auth && params.orders) {
    app.use(
      "/api",
      ordersRouter({
        authService: params.auth.authService,
        cookie: params.auth.cookie,
        ordersService: params.orders.ordersService,
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

  if (params.auth && params.pos) {
    app.use(
      "/api/pos",
      posRouter({
        authService: params.auth.authService,
        cookie: params.auth.cookie,
        posService: params.pos.posService,
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
