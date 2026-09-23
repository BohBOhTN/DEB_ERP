import { apiClient } from "../../lib/api/client.js";
import type { PageResult, SortSpec } from "../../lib/api/pagination.js";
import { toSearchParams } from "../../lib/api/pagination.js";

/// `/api/v1/audit-events` (UI-20, BE-37): every row carries its French
/// action and entity labels; the viewer never shows a raw key first.
export interface AuditEvent {
  id: string;
  actorUserId: string | null;
  action: string;
  entity: string;
  targetId: string | null;
  correlationId: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
  actor: { id: string; displayName: string; email: string } | null;
  actionLabelFr: string;
  entityLabelFr: string;
  targetModule: string | null;
}

export interface AuditFilters {
  actions: string[];
  entities: string[];
  actionOptions: Array<{ value: string; labelFr: string }>;
  entityOptions: Array<{ value: string; labelFr: string }>;
}

export interface AuditListQuery {
  page: number;
  pageSize: number;
  sort?: SortSpec;
  actorUserId?: string;
  action?: string;
  entity?: string;
  targetId?: string;
  correlationId?: string;
  from?: string;
  to?: string;
}

export function listAuditEvents(
  query: AuditListQuery,
): Promise<PageResult<AuditEvent>> {
  return apiClient.list<AuditEvent>("/audit-events", {
    query: toSearchParams({ ...query }),
  });
}

export async function getAuditFilters(): Promise<AuditFilters> {
  return apiClient.get<AuditFilters>("/audit-filters");
}
