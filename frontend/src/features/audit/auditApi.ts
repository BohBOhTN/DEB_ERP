import { readApiError, type ApiEnvelope } from "../auth/authApi";
import type { Page } from "../catalog/catalogApi";

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

export interface AuditEvent {
  id: string;
  action: string;
  entity: string;
  targetId: string | null;
  correlationId: string | null;
  reason: string | null;
  createdAt: string;
  actor: {
    id: string;
    displayName: string;
    email: string;
  } | null;
}

export interface AuditFilters {
  actions: string[];
  entities: string[];
}

export interface AuditQuery {
  action?: string;
  entity?: string;
  correlationId?: string;
  from?: string;
  to?: string;
  page?: number;
}

export async function getAuditEvents(
  query: AuditQuery,
): Promise<Page<AuditEvent>> {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }

  const suffix = search.toString() ? `?${search.toString()}` : "";
  return getKeyed(`/audit-events${suffix}`, "auditEvents");
}

export async function getAuditFilters(): Promise<AuditFilters> {
  return getKeyed("/audit-filters", "auditFilters");
}

async function getKeyed<TResult>(path: string, key: string): Promise<TResult> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const body = (await response.json()) as ApiEnvelope<Record<string, TResult>>;
  return body.data[key];
}
