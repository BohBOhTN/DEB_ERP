import { createRequire } from "node:module";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { AccessService } from "./modules/access/access.service.js";
import { AuditService } from "./modules/audit/audit.service.js";
import { PrismaAuthRepository } from "./modules/auth/auth.repository.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { PermissionCache } from "./modules/auth/permissionCache.js";
import { CatalogService } from "./modules/catalog/catalog.service.js";
import { CustomersService } from "./modules/customers/customers.service.js";
import { DistributionService } from "./modules/distribution/distribution.service.js";
import { ExpensesService } from "./modules/expenses/expenses.service.js";
import {
  createHealthCheck,
  createLivenessCheck,
} from "./modules/health/health.service.js";
import { InventoryService } from "./modules/inventory/inventory.service.js";
import { OrdersService } from "./modules/orders/orders.service.js";
import { PosService } from "./modules/pos/pos.service.js";
import { ProcurementService } from "./modules/procurement/procurement.service.js";
import { SimulationService } from "./modules/simulation/simulation.service.js";
import { scheduleCleanup } from "./jobs/cleanup.js";
import { createLogger } from "./shared/logger.js";
import { createPrismaClient } from "./shared/prisma.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };
const build = { version, gitSha: env.GIT_SHA };

const logger = createLogger({
  level: env.LOG_LEVEL,
  pretty: env.LOG_PRETTY && env.NODE_ENV !== "production",
});

// A rejected promise nobody awaited or a thrown error outside a request means
// the process state is unknown. Log it with the build identity and exit so the
// process manager restarts a clean instance instead of serving from a broken
// one. Handlers are installed before anything asynchronous starts.
process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason, ...build }, "unhandled promise rejection");
  process.exit(1);
});
process.on("uncaughtException", (error) => {
  logger.fatal({ err: error, ...build }, "uncaught exception");
  process.exit(1);
});

const prisma = createPrismaClient({
  logger,
  slowQueryMs: env.SLOW_QUERY_MS,
});
const permissionCache = new PermissionCache(env.PERMISSION_CACHE_TTL_MS);
const accessService = new AccessService(prisma, permissionCache);
const auditService = new AuditService(prisma);
const catalogService = new CatalogService(prisma);
const customersService = new CustomersService(prisma);
const distributionService = new DistributionService(prisma);
const expensesService = new ExpensesService(prisma);
const inventoryService = new InventoryService(prisma);
const ordersService = new OrdersService(prisma);
const procurementService = new ProcurementService(prisma);
const posService = new PosService(prisma);
const simulationService = new SimulationService(prisma);
const authService = new AuthService(
  new PrismaAuthRepository(prisma, permissionCache),
  env.SESSION_TTL_MINUTES,
  auditService,
  { touchIntervalMs: env.SESSION_TOUCH_INTERVAL_MS },
);

await accessService.bootstrapSystemAccess();
await catalogService.bootstrapCatalogData();
await inventoryService.bootstrapInventoryData();
await posService.bootstrapPosData();
await expensesService.bootstrapExpenseData();

const app = createApp({
  logger,
  trustProxy: env.TRUST_PROXY,
  globalRateLimit: {
    maxRequests: env.GLOBAL_RATE_LIMIT_MAX,
    windowMs: env.GLOBAL_RATE_LIMIT_WINDOW_MS,
  },
  allowedOrigins: env.CORS_ALLOWED_ORIGINS.split(",").map((origin) =>
    origin.trim(),
  ),
  healthCheck: createHealthCheck({
    prisma,
    environment: env.NODE_ENV,
    build,
  }),
  livenessCheck: createLivenessCheck(build),
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
  access: {
    accessService,
  },
  audit: {
    auditService,
  },
  catalog: {
    catalogService,
  },
  customers: {
    customersService,
  },
  distribution: {
    distributionService,
  },
  expenses: {
    expensesService,
  },
  inventory: {
    inventoryService,
  },
  orders: {
    ordersService,
  },
  procurement: {
    procurementService,
  },
  pos: {
    posService,
  },
  simulation: {
    simulationService,
  },
});

const stopCleanup = scheduleCleanup(
  { prisma, logger, idempotencyTtlDays: env.IDEMPOTENCY_TTL_DAYS },
  6 * 60 * 60 * 1000,
);

const server = app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, environment: env.NODE_ENV, ...build },
    "API listening",
  );
});

// A stalled client must not hold a worker forever. Headers get a little longer
// than the whole request so the two limits cannot race each other.
server.requestTimeout = env.REQUEST_TIMEOUT_MS;
server.headersTimeout = env.REQUEST_TIMEOUT_MS + 5_000;

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info({ signal }, "shutdown requested");
  stopCleanup();

  // If in-flight requests do not drain in time, exit anyway: the process
  // manager will start a fresh instance and the client will retry.
  const forceExit = setTimeout(() => {
    logger.error(
      { timeoutMs: env.SHUTDOWN_TIMEOUT_MS },
      "shutdown timed out; forcing exit",
    );
    process.exit(1);
  }, env.SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  server.close((closeError) => {
    if (closeError) {
      logger.error({ err: closeError }, "server close failed");
    }

    prisma
      .$disconnect()
      .then(() => {
        logger.info("shutdown complete");
        process.exit(closeError ? 1 : 0);
      })
      .catch((disconnectError: unknown) => {
        logger.error({ err: disconnectError }, "database disconnect failed");
        process.exit(1);
      });
  });
  server.closeIdleConnections();
}

process.on("SIGINT", () => {
  shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});
