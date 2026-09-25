import { apiClient } from "../../lib/api/client.js";

/// `/api/v1/health/ready` (UI-21): the build identity shown under "À propos".
export interface HealthReady {
  status: "ok" | "degraded";
  service: string;
  environment: string;
  database: { status: string; migration?: string | null };
  version?: string;
  gitSha?: string;
}

export function getHealthReady(): Promise<HealthReady> {
  return apiClient.get<HealthReady>("/health/ready");
}
