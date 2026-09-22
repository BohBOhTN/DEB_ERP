import { PrismaClient } from "@prisma/client";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { AccessService } from "./modules/access/access.service.js";
import { PrismaAuthRepository } from "./modules/auth/auth.repository.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { CatalogService } from "./modules/catalog/catalog.service.js";
import { CustomersService } from "./modules/customers/customers.service.js";
import { DistributionService } from "./modules/distribution/distribution.service.js";
import { createHealthCheck } from "./modules/health/health.service.js";
import { InventoryService } from "./modules/inventory/inventory.service.js";
import { OrdersService } from "./modules/orders/orders.service.js";
import { PosService } from "./modules/pos/pos.service.js";
import { ProcurementService } from "./modules/procurement/procurement.service.js";
import { SimulationService } from "./modules/simulation/simulation.service.js";

const prisma = new PrismaClient();
const accessService = new AccessService(prisma);
const catalogService = new CatalogService(prisma);
const customersService = new CustomersService(prisma);
const distributionService = new DistributionService(prisma);
const inventoryService = new InventoryService(prisma);
const ordersService = new OrdersService(prisma);
const procurementService = new ProcurementService(prisma);
const posService = new PosService(prisma);
const simulationService = new SimulationService(prisma);
const authService = new AuthService(
  new PrismaAuthRepository(prisma),
  env.SESSION_TTL_MINUTES,
);

await accessService.bootstrapSystemAccess();
await catalogService.bootstrapCatalogData();
await inventoryService.bootstrapInventoryData();
await posService.bootstrapPosData();

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
  access: {
    accessService,
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
