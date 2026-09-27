import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { accessRouter } from "./modules/access/access.routes.js";
import type { AccessService } from "./modules/access/access.service.js";
import { auditRouter } from "./modules/audit/audit.routes.js";
import type { AuditService } from "./modules/audit/audit.service.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import type { AuthService } from "./modules/auth/auth.service.js";
import type { SessionCookieConfig } from "./modules/auth/cookies.js";
import { catalogRouter } from "./modules/catalog/catalog.routes.js";
import type { CatalogService } from "./modules/catalog/catalog.service.js";
import { customersRouter } from "./modules/customers/customers.routes.js";
import type { CustomersService } from "./modules/customers/customers.service.js";
import { distributionRouter } from "./modules/distribution/distribution.routes.js";
import { expensesRouter } from "./modules/expenses/expenses.routes.js";
import type { ExpensesService } from "./modules/expenses/expenses.service.js";
import type { DistributionService } from "./modules/distribution/distribution.service.js";
import { healthRouter } from "./modules/health/health.routes.js";
import type {
  HealthCheck,
  LivenessCheck,
} from "./modules/health/health.service.js";
import { homeRouter } from "./modules/home/home.routes.js";
import { buildOpenApiDocument } from "./openapi/document.js";
import type { HomeService } from "./modules/home/home.service.js";
import { inventoryRouter } from "./modules/inventory/inventory.routes.js";
import type { InventoryService } from "./modules/inventory/inventory.service.js";
import { ordersRouter } from "./modules/orders/orders.routes.js";
import type { OrdersService } from "./modules/orders/orders.service.js";
import { posRouter } from "./modules/pos/pos.routes.js";
import type { PosService } from "./modules/pos/pos.service.js";
import { procurementRouter } from "./modules/procurement/procurement.routes.js";
import { simulationRouter } from "./modules/simulation/simulation.routes.js";
import type { SimulationService } from "./modules/simulation/simulation.service.js";
import type { ProcurementService } from "./modules/procurement/procurement.service.js";
import { createRateLimiter } from "./modules/auth/rateLimit.js";
import { AppError } from "./shared/appError.js";
import { correlationId } from "./shared/correlation.js";
import { createLogger, type Logger } from "./shared/logger.js";
import { markApiVersion, markDeprecated } from "./shared/apiVersion.js";

export function createApp(params: {
  allowedOrigins: string[];
  healthCheck: HealthCheck;
  livenessCheck?: LivenessCheck;
  /// Route tests build an app without a logger; a silent one keeps them quiet
  /// while the real server injects the configured pino instance.
  logger?: Logger;
  /// Number of proxy hops to trust for the client address (Express
  /// `trust proxy`). Behind nginx this must be at least 1 or every user shares
  /// the proxy's rate-limit bucket.
  trustProxy?: number | boolean;
  /// Soft ceiling for any client, applied to every route. Absent in tests.
  globalRateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
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
  audit?: {
    auditService: AuditService;
  };
  /// Folder of the product photos, served under `/media` (issue #64). In
  /// production nginx serves the same folder first; the API keeps serving
  /// it so a development frontend on another origin can load the photos.
  mediaRoot?: string;
  catalog?: {
    catalogService: CatalogService;
  };
  customers?: {
    customersService: CustomersService;
  };
  distribution?: {
    distributionService: DistributionService;
  };
  expenses?: {
    expensesService: ExpensesService;
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
  simulation?: {
    simulationService: SimulationService;
  };
  home?: {
    homeService: HomeService;
  };
  /// Serves the generated contract at `/api/v1/openapi.json`; off in
  /// production, where the committed file is the reference.
  serveOpenApi?: boolean;
}): express.Express {
  const app = express();
  const logger = params.logger ?? createLogger({ level: "silent" });

  app.disable("x-powered-by");
  if (params.trustProxy !== undefined) {
    app.set("trust proxy", params.trustProxy);
  }

  // The correlation id is assigned before anything can fail so that every log
  // line and every error body, including a rate-limit rejection, carries it.
  app.use(correlationId);
  app.use(requestLogger(logger));
  app.use(helmet());
  app.use(
    cors({
      origin: params.allowedOrigins,
      credentials: true,
    }),
  );
  if (params.globalRateLimit) {
    app.use(
      createRateLimiter({
        maxAttempts: params.globalRateLimit.maxRequests,
        windowMs: params.globalRateLimit.windowMs,
      }),
    );
  }
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
  if (params.mediaRoot) {
    app.use(
      "/media",
      express.static(params.mediaRoot, {
        index: false,
        redirect: false,
        maxAge: "30d",
        immutable: true,
        setHeaders: (response) => {
          // Photos are `<img>` sources from any of our origins.
          response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
          response.setHeader("X-Content-Type-Options", "nosniff");
        },
      }),
    );
  }

  // Every router is mounted twice: under /api/v1, the contract the new
  // frontend builds against, and under the legacy /api prefix the V1 screens
  // still call. Legacy responses carry a Deprecation header until the aliases
  // are removed in Sprint 28 (BE-46).
  const mount = (legacyPrefix: string, router: express.Router) => {
    const suffix = legacyPrefix.replace(/^\/api/, "");
    app.use(`/api/v1${suffix}`, markApiVersion(1), router);
    app.use(legacyPrefix, markDeprecated, router);
  };

  mount("/api/health", healthRouter(params.healthCheck, params.livenessCheck));

  if (params.auth) {
    mount("/api/auth", authRouter(params.auth));
  }

  if (params.auth && params.access) {
    mount(
      "/api/access",
      accessRouter({
        authService: params.auth.authService,
        cookie: params.auth.cookie,
        accessService: params.access.accessService,
      }),
    );
  }

  if (params.auth && params.audit) {
    mount(
      "/api",
      auditRouter({
        authService: params.auth.authService,
        cookie: params.auth.cookie,
        auditService: params.audit.auditService,
      }),
    );
  }

  if (params.auth && params.catalog) {
    mount(
      "/api/catalog",
      catalogRouter({
        authService: params.auth.authService,
        cookie: params.auth.cookie,
        catalogService: params.catalog.catalogService,
      }),
    );
  }

  if (params.auth && params.customers) {
    mount(
      "/api",
      customersRouter({
        authService: params.auth.authService,
        cookie: params.auth.cookie,
        customersService: params.customers.customersService,
      }),
    );
  }

  if (params.auth && params.distribution) {
    mount(
      "/api",
      distributionRouter({
        authService: params.auth.authService,
        cookie: params.auth.cookie,
        distributionService: params.distribution.distributionService,
      }),
    );
  }

  if (params.auth && params.expenses) {
    mount(
      "/api",
      expensesRouter({
        authService: params.auth.authService,
        cookie: params.auth.cookie,
        expensesService: params.expenses.expensesService,
      }),
    );
  }

  if (params.auth && params.inventory) {
    mount(
      "/api/inventory",
      inventoryRouter({
        authService: params.auth.authService,
        cookie: params.auth.cookie,
        inventoryService: params.inventory.inventoryService,
      }),
    );
  }

  if (params.auth && params.orders) {
    mount(
      "/api",
      ordersRouter({
        authService: params.auth.authService,
        cookie: params.auth.cookie,
        ordersService: params.orders.ordersService,
      }),
    );
  }

  if (params.auth && params.procurement) {
    mount(
      "/api/procurement",
      procurementRouter({
        authService: params.auth.authService,
        cookie: params.auth.cookie,
        procurementService: params.procurement.procurementService,
      }),
    );
  }

  if (params.auth && params.pos) {
    mount(
      "/api/pos",
      posRouter({
        authService: params.auth.authService,
        cookie: params.auth.cookie,
        posService: params.pos.posService,
      }),
    );
  }

  if (params.auth && params.simulation) {
    mount(
      "/api",
      simulationRouter({
        authService: params.auth.authService,
        cookie: params.auth.cookie,
        simulationService: params.simulation.simulationService,
      }),
    );
  }

  if (params.serveOpenApi) {
    let document: ReturnType<typeof buildOpenApiDocument> | undefined;
    app.get("/api/v1/openapi.json", (_request, response) => {
      document ??= buildOpenApiDocument();
      response.json(document);
    });
  }

  // The home summary is new in V2 and has no legacy alias.
  if (params.auth && params.home) {
    app.use(
      "/api/v1/home",
      markApiVersion(1),
      homeRouter({
        authService: params.auth.authService,
        cookie: params.auth.cookie,
        homeService: params.home.homeService,
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
