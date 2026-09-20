import { PrismaClient } from "@prisma/client";

export interface HealthStatus {
  status: "ok" | "degraded";
  service: "api";
  environment: string;
  database: {
    status: "ok" | "unavailable";
  };
}

export type HealthCheck = () => Promise<HealthStatus>;

export function createHealthCheck(params: {
  prisma: PrismaClient;
  environment: string;
}): HealthCheck {
  return async () => {
    try {
      await params.prisma.$queryRaw`SELECT 1`;

      return {
        status: "ok",
        service: "api",
        environment: params.environment,
        database: {
          status: "ok",
        },
      };
    } catch {
      return {
        status: "degraded",
        service: "api",
        environment: params.environment,
        database: {
          status: "unavailable",
        },
      };
    }
  };
}
