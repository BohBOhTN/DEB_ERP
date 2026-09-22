import { PrismaClient } from "@prisma/client";

export interface HealthStatus {
  status: "ok" | "degraded";
  service: "api";
  environment: string;
  database: {
    status: "ok" | "unavailable";
    /// Name of the latest applied migration, so an operator can confirm a
    /// deployment ran `prisma migrate deploy` before the app started.
    migration?: string | null;
  };
  version?: string;
  gitSha?: string;
}

export interface LivenessStatus {
  status: "ok";
  service: "api";
  version?: string;
  gitSha?: string;
}

/// Readiness: the process can serve traffic (database reachable).
export type HealthCheck = () => Promise<HealthStatus>;

/// Liveness: the process is running. It touches no dependency so a database
/// outage does not make the orchestrator restart a healthy process.
export type LivenessCheck = () => LivenessStatus;

export interface HealthBuildInfo {
  version?: string;
  gitSha?: string;
}

export function createHealthCheck(params: {
  prisma: PrismaClient;
  environment: string;
  build?: HealthBuildInfo;
}): HealthCheck {
  return async () => {
    try {
      const rows = await params.prisma.$queryRaw<
        Array<{ migration_name: string }>
      >`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`;

      return {
        status: "ok",
        service: "api",
        environment: params.environment,
        database: {
          status: "ok",
          migration: rows[0]?.migration_name ?? null,
        },
        version: params.build?.version,
        gitSha: params.build?.gitSha,
      };
    } catch {
      return {
        status: "degraded",
        service: "api",
        environment: params.environment,
        database: {
          status: "unavailable",
        },
        version: params.build?.version,
        gitSha: params.build?.gitSha,
      };
    }
  };
}

export function createLivenessCheck(build?: HealthBuildInfo): LivenessCheck {
  return () => ({
    status: "ok",
    service: "api",
    version: build?.version,
    gitSha: build?.gitSha,
  });
}
