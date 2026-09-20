export interface HealthEnvelope {
  data: {
    status: "ok" | "degraded";
    service: "api";
    environment: string;
    database: {
      status: "ok" | "unavailable";
    };
  };
  meta: {
    correlationId: string;
  };
}

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

export async function fetchHealth(): Promise<HealthEnvelope> {
  const response = await fetch(`${apiBaseUrl}/health`);

  if (!response.ok) {
    throw new Error("health_check_failed");
  }

  return response.json() as Promise<HealthEnvelope>;
}
